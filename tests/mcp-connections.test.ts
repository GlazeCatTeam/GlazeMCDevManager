import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { connectClient, migrateConnections } from "../apps/desktop/src/main/mcp/connections";
import { checkTool, createInstallers, type Installer, installTool } from "../apps/desktop/src/main/mcp/installers";
import type { McpInstallerId } from "../packages/contracts/src";
import { emptyMcpData, McpError, type McpPorts } from "../packages/mcp/src/model";
import { McpService } from "../packages/mcp/src/service";

const endpoint = "http://127.0.0.1:17839/mcp";
const movedEndpoint = "http://127.0.0.1:17840/mcp";
const originalUrl = `${endpoint}?key=original-test-key`;
const replacementUrl = `${movedEndpoint}?key=replacement-test-key`;

/** Give each test a private home, including every AI client's configuration and cleanup */
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-connections-"));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("glaze-mcp-connections-"));
    return rm(root, { recursive: true, force: true });
  });
  const entries = createInstallers({ home: root, appData: join(root, "AppData"), claudeCli: async () => null });
  /** Locate a private client file without ever consulting the user's real paths */
  const installer = (id: McpInstallerId) => {
    const value = entries.find((entry) => entry.id === id);
    assert.ok(value);
    return value;
  };
  /** Seed a file exactly as a real AI client would store it */
  const seed = async (id: McpInstallerId, text: string) => {
    const file = installer(id).file;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    return file;
  };
  /** Keep both installation and verification bound to the same isolated registry */
  const configuration = (clients: Installer[] = entries) => ({
    install: (id: McpInstallerId, url: string) => installTool(id, url, clients),
    check: (id: McpInstallerId, url: string) => checkTool(id, url, clients),
  });
  return { root, entries, installer, seed, configuration };
}

/** Create a service that can persist grants but cannot perform platform requests */
function serviceFixture() {
  const ports: McpPorts = {
    save: () => undefined,
    changed: () => undefined,
    accounts: () => [
      {
        id: "account-a",
        nickname: "测试账号",
        passport: null,
        avatarUrl: null,
        loginMethod: "cookie",
        lastLoginAt: 0,
        status: "active",
        current: true,
      },
    ],
    assertEnabled: () => undefined,
    read: async () => {
      throw new Error("No platform access in connection tests");
    },
    editor: async () => {
      throw new Error("No platform access in connection tests");
    },
    options: async () => {
      throw new Error("No platform access in connection tests");
    },
    validate: async () => [],
    saveWork: async () => {
      throw new Error("No platform access in connection tests");
    },
    createWork: async () => {
      throw new Error("No platform access in connection tests");
    },
    review: async () => {
      throw new Error("No platform access in connection tests");
    },
    pickFile: async () => null,
    upload: async () => {
      throw new Error("No platform access in connection tests");
    },
    assetRoot: "unused-connection-test-root",
  };
  const data = emptyMcpData();
  data.enabled = true;
  const service = new McpService(data, ports);
  service.status = "running";
  service.endpoint = endpoint;
  return service;
}

test("all supported config formats verify the complete URL and restore the exact original file", async (t) => {
  const f = await fixture(t);
  const formats: { id: McpInstallerId; source: string }[] = [
    {
      id: "codex",
      source: `model = "test-model"\r\n\r\n[mcp_servers.other]\r\nurl = "https://example.invalid/mcp"\r\n\r\n[mcp_servers."glaze"]\r\nurl = '${originalUrl}' # keep this comment\r\n[mcp_servers."glaze".env]\r\nCUSTOM = "preserved-on-rollback"\r\n`,
    },
    ...(["claude-code", "cursor", "vscode", "windsurf", "gemini"] as const).map((id) => ({
      id,
      source: `\uFEFF${JSON.stringify({ appearance: "unchanged", [id === "vscode" ? "servers" : "mcpServers"]: { other: { url: "https://example.invalid/mcp" } } }, null, 4)}\r\n`,
    })),
  ];
  for (const { id, source } of formats) {
    const file = await f.seed(id, source);
    const restore = await installTool(id, replacementUrl, f.entries);
    assert.equal(await checkTool(id, replacementUrl, f.entries), true, id);
    assert.equal(await checkTool(id, replacementUrl.replace(":17840/", ":17839/"), f.entries), false, id);
    assert.equal(
      await checkTool(id, replacementUrl.replace("replacement-test-key", "other-key"), f.entries),
      false,
      id,
    );
    assert.ok((await readFile(file, "utf8")).includes("https://example.invalid/mcp"));
    await restore();
    assert.equal(await readFile(file, "utf8"), source, id);
  }
});

test("configuration checks ignore JSON property order and reject keys hidden in unrelated fields or TOML subtables", async (t) => {
  const f = await fixture(t);
  await f.seed(
    "claude-code",
    JSON.stringify({ mcpServers: { glaze: { url: originalUrl, type: "http", headers: {} } } }),
  );
  assert.equal(await checkTool("claude-code", originalUrl, f.entries), true);
  await f.seed("cursor", JSON.stringify({ mcpServers: { glaze: { url: replacementUrl, comment: originalUrl } } }));
  assert.equal(await checkTool("cursor", originalUrl, f.entries), false);
  await f.seed(
    "codex",
    `[mcp_servers.glaze]\nurl = "${replacementUrl}"\n[mcp_servers.glaze.env]\nurl = "${originalUrl}"\n`,
  );
  assert.equal(await checkTool("codex", originalUrl, f.entries), false);
  assert.equal(await checkTool("codex", replacementUrl, f.entries), true);
});

test("failed installers and failed URL verification restore previous bytes and remove newly created files", async (t) => {
  const f = await fixture(t);
  const source = `{ "mcpServers": { "glaze": { "url": "${originalUrl}" } }, "keep": true }\r\n`;
  const file = await f.seed("cursor", source);
  const cursor = f.installer("cursor");
  const failsAfterWrite = {
    ...cursor,
    install: async (url: string) => {
      await cursor.install(url);
      throw new Error("Simulated CLI failure");
    },
  };
  await assert.rejects(installTool("cursor", replacementUrl, [failsAfterWrite]), /写入 Cursor 配置失败/);
  assert.equal(await readFile(file, "utf8"), source);
  await assert.rejects(
    installTool("cursor", replacementUrl, [{ ...cursor, has: async () => false }]),
    /地址未正确写入/,
  );
  assert.equal(await readFile(file, "utf8"), source);
  const codex = f.installer("codex");
  await assert.rejects(installTool("codex", replacementUrl, [{ ...codex, has: async () => false }]), /地址未正确写入/);
  assert.equal(existsSync(codex.file), false);
});

test("unsupported JSONC remains untouched and unreadable configs are explicitly unhealthy", async (t) => {
  const f = await fixture(t);
  const source = `{\n // existing Copilot settings\n "servers": {}\n}\n`;
  const file = await f.seed("vscode", source);
  await assert.rejects(installTool("vscode", replacementUrl, f.entries), /含注释或格式不标准/);
  assert.equal(await readFile(file, "utf8"), source);
  assert.equal(existsSync(`${file}.glaze-backup`), false);
  assert.equal(await checkTool("vscode", originalUrl, f.entries), null);
});

test("failed reconnect keeps the original key, grant, material folders and active connection", async (t) => {
  const f = await fixture(t);
  const service = serviceFixture();
  const previous = service.createKeyedClient("Cursor", "cursor", "view");
  previous.client.directories = [{ id: "material", name: "测试材料", path: join(f.root, "materials") }];
  const grant = structuredClone(previous.client);
  let disconnected = false;
  service.connected(previous.client.id, () => {
    disconnected = true;
  });
  await installTool("cursor", `${endpoint}?key=${previous.key}`, f.entries);
  const cursor = f.installer("cursor");
  const clients = f.entries.map((entry) =>
    entry.id === "cursor" ? { ...cursor, has: async (url: string) => url.includes(previous.key) } : entry,
  );
  const result = await connectClient(service, "Cursor", "cursor", "full", f.configuration(clients).install);
  assert.equal(result.installed, false);
  assert.match(result.message, /原连接与授权已保留/);
  assert.equal(result.key, previous.key);
  assert.equal(service.clientByKey(previous.key), previous.client);
  assert.equal(disconnected, false);
  assert.equal(service.data.clients.length, 1);
  assert.deepEqual(previous.client.permissions, grant.permissions);
  assert.deepEqual(previous.client.accounts, grant.accounts);
  assert.deepEqual(previous.client.directories, grant.directories);
  assert.equal(await checkTool("cursor", `${endpoint}?key=${previous.key}`, f.entries), true);
});

test("successful reconnect verifies the new file before disconnecting the old client", async (t) => {
  const f = await fixture(t);
  const service = serviceFixture();
  const previous = service.createKeyedClient("Codex", "codex", "view");
  await installTool("codex", `${endpoint}?key=${previous.key}`, f.entries);
  let disconnected = false;
  service.connected(previous.client.id, () => {
    disconnected = true;
  });
  const result = await connectClient(service, "Codex", "codex", "assist", async (id, url) => {
    assert.equal(service.clientByKey(previous.key), previous.client);
    assert.equal(disconnected, false);
    return f.configuration().install(id, url);
  });
  assert.equal(result.installed, true);
  assert.equal(disconnected, true);
  assert.equal(service.clientByKey(previous.key), undefined);
  assert.equal(service.clientByKey(result.key), result.client);
  assert.equal(service.data.clients.length, 1);
  assert.equal(await checkTool("codex", `${endpoint}?key=${result.key}`, f.entries), true);
});

test("a failed first installation still supplies a valid key for manual setup", async (t) => {
  const f = await fixture(t);
  const service = serviceFixture();
  await f.seed("vscode", "{ // JSONC\n}");
  const result = await connectClient(service, "VS Code", "vscode", "assist", f.configuration().install);
  assert.equal(result.installed, false);
  assert.equal(service.clientByKey(result.key), result.client);
  assert.equal(service.data.clients.length, 1);
});

test("multi-client port migration rolls back all files when a later installer fails", async (t) => {
  const f = await fixture(t);
  const service = serviceFixture();
  const first = service.createKeyedClient("Codex", "codex", "assist");
  const second = service.createKeyedClient("Cursor", "cursor", "assist");
  for (const { client, key } of [first, second])
    await installTool(client.tool as McpInstallerId, `${endpoint}?key=${key}`, f.entries);
  const original = await readFile(f.installer("codex").file);
  const cursor = f.installer("cursor");
  const clients = f.entries.map((entry) =>
    entry.id === "cursor"
      ? {
          ...cursor,
          install: async (url: string) => {
            await cursor.install(url);
            throw new Error("Simulated disk failure");
          },
        }
      : entry,
  );
  await assert.rejects(
    migrateConnections(service.data.clients, endpoint, movedEndpoint, f.configuration(clients)),
    /端口未切换.*重新写入/,
  );
  assert.deepEqual(await readFile(f.installer("codex").file), original);
  for (const { client, key } of [first, second])
    assert.equal(await checkTool(client.tool as McpInstallerId, `${endpoint}?key=${key}`, f.entries), true);
  assert.equal(service.data.port, 17839);
  assert.equal(service.endpoint, endpoint);
  assert.equal(service.clientByKey(first.key), first.client);
  assert.equal(service.clientByKey(second.key), second.client);
});

test("successful port migration verifies every complete new endpoint", async (t) => {
  const f = await fixture(t);
  const service = serviceFixture();
  for (const [name, id] of [
    ["Codex", "codex"],
    ["Cursor", "cursor"],
  ] as const) {
    const { key } = service.createKeyedClient(name, id, "assist");
    await installTool(id, `${endpoint}?key=${key}`, f.entries);
  }
  await migrateConnections(service.data.clients, endpoint, movedEndpoint, f.configuration());
  for (const client of service.data.clients) {
    assert.ok(client.tool && client.key);
    assert.equal(await checkTool(client.tool, `${movedEndpoint}?key=${client.key}`, f.entries), true);
    assert.equal(await checkTool(client.tool, `${endpoint}?key=${client.key}`, f.entries), false);
  }
});

test("rollback failures name the affected client and remain detectable for repair", async (t) => {
  const f = await fixture(t);
  const service = serviceFixture();
  const first = service.createKeyedClient("Codex", "codex", "assist");
  const second = service.createKeyedClient("Cursor", "cursor", "assist");
  for (const { client, key } of [first, second])
    await installTool(client.tool as McpInstallerId, `${endpoint}?key=${key}`, f.entries);
  await assert.rejects(
    migrateConnections(service.data.clients, endpoint, movedEndpoint, {
      check: f.configuration().check,
      install: async (id, url) => {
        if (id === "cursor") throw new McpError("config", "Cursor 配置不可写");
        await f.configuration().install(id, url);
        return async () => {
          throw new Error("Simulated rollback failure");
        };
      },
    }),
    /Codex 的原配置未能恢复.*重新写入/,
  );
  assert.equal(await checkTool("codex", `${endpoint}?key=${first.key}`, f.entries), false);
  await installTool("codex", `${endpoint}?key=${first.key}`, f.entries);
  assert.equal(await checkTool("codex", `${endpoint}?key=${first.key}`, f.entries), true);
});

test("port migration respects removed config entries and refuses unreadable configurations", async (t) => {
  const f = await fixture(t);
  const service = serviceFixture();
  service.createKeyedClient("Cursor", "cursor", "assist");
  await migrateConnections(service.data.clients, endpoint, movedEndpoint, f.configuration());
  assert.equal(existsSync(f.installer("cursor").file), false);
  await f.seed("cursor", "{ // JSONC\n}");
  await assert.rejects(
    migrateConnections(service.data.clients, endpoint, movedEndpoint, f.configuration()),
    /无法读取 Cursor.*重新写入/,
  );
});

test("transaction rollback preserves unrelated changes made by another program after installation", async (t) => {
  const f = await fixture(t);
  const service = serviceFixture();
  const first = service.createKeyedClient("Codex", "codex", "assist");
  const second = service.createKeyedClient("Cursor", "cursor", "assist");
  for (const { client, key } of [first, second])
    await installTool(client.tool as McpInstallerId, `${endpoint}?key=${key}`, f.entries);
  const codexFile = f.installer("codex").file;
  await assert.rejects(
    migrateConnections(service.data.clients, endpoint, movedEndpoint, {
      check: f.configuration().check,
      install: async (id, url) => {
        if (id === "codex") return f.configuration().install(id, url);
        await writeFile(codexFile, `${await readFile(codexFile, "utf8")}\n[other_program]\nkeep = true\n`);
        throw new McpError("config", "Cursor 配置不可写");
      },
    }),
    /Codex 的原配置未能恢复.*已被其他程序修改.*重新写入/,
  );
  assert.match(await readFile(codexFile, "utf8"), /\[other_program\]\nkeep = true/);
  assert.equal(await checkTool("codex", `${endpoint}?key=${first.key}`, f.entries), false);
  await installTool("codex", `${endpoint}?key=${first.key}`, f.entries);
  assert.equal(await checkTool("codex", `${endpoint}?key=${first.key}`, f.entries), true);
  assert.match(await readFile(codexFile, "utf8"), /\[other_program\]\nkeep = true/);
});
