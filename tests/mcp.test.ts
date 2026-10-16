import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createMcpBusiness } from "../apps/desktop/src/main/mcp/business";
import {
  type AccountSummary,
  emptyWorkCreateFields,
  type McpDraft,
  type McpOperation,
  mcpPermissions,
} from "../packages/contracts/src";
import { Client } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";
import { InMemoryTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { ToolListChangedNotificationSchema } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js";
import { resolveMaterial, snapshotMaterial, verifyMaterial } from "../packages/mcp/src/assets";
import { emptyMcpData, McpError, type McpPorts } from "../packages/mcp/src/model";
import { createMcpServer, McpHttpServer } from "../packages/mcp/src/server";
import { McpService } from "../packages/mcp/src/service";
import { legacyToolDefinitions } from "../packages/mcp/src/tools";

/** Build an isolated service with explicit network stubs and a durable-state spy */
function fixture(legacy = true) {
  const account: AccountSummary = {
    id: "a",
    nickname: "测试账号",
    passport: null,
    avatarUrl: null,
    loginMethod: "cookie",
    lastLoginAt: 0,
    status: "active",
    current: true,
  };
  const accounts: [AccountSummary, AccountSummary] = [
    account,
    { ...account, id: "b", nickname: "第二账号", current: false },
  ];
  const remote = {
    itemId: "123",
    status: "init" as const,
    version: "1",
    modCode: "",
    guides: [],
    fields: { ...emptyWorkCreateFields(), item_name: "原名称" },
  };
  const counts = { save: 0, create: 0, review: 0, upload: 0 };
  let durable = emptyMcpData();
  const ports: McpPorts = {
    save: (data) => {
      durable = structuredClone(data);
    },
    changed: () => {},
    accounts: () => accounts,
    assertEnabled: () => {},
    read: async (_method, params) => params,
    editor: async () => structuredClone(remote),
    options: async () => {
      throw new Error("unused");
    },
    validate: async () => [],
    saveWork: async (_draft, patch, guard) => {
      guard();
      assert.equal(durable.operations[0]?.phase, "saving");
      counts.save++;
      Object.assign(remote.fields, patch);
    },
    createWork: async (_draft, _fields, guard) => {
      guard();
      counts.create++;
    },
    review: async (_account, _id, _expected, guard) => {
      guard();
      counts.review++;
      return { needCheckApply: false, queueLength: 0 };
    },
    pickFile: async () => null,
    upload: async (_draft, _asset, guard) => {
      guard();
      counts.upload++;
      return {
        name: "a.png",
        size: 1,
        url: "https://x.nosdn.127.net/a.png",
        receipt: { body: "{}", sign: "host-only", file_type: "image" },
      };
    },
    assetRoot: join(tmpdir(), "glaze-mcp-test-unused"),
  };
  const service = new McpService(emptyMcpData(), ports);
  // Retain regression coverage of the internal snapshot executor; production publishes direct tools only
  if (legacy) service.definitions.splice(0, service.definitions.length, ...legacyToolDefinitions());
  service.data.enabled = true;
  service.status = "running";
  const client = service.registerClient("测试 AI");
  service.connected(client.id, () => {});
  service.grant(client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  const call = (name: string, params: unknown = {}) => service.call(client.id, name, params);
  const draft = async (key = "draft") =>
    (await call("works_draft_create", { itemId: "123", idempotencyKey: key })) as McpDraft;
  return { service, client, ports, remote, accounts, counts, call, draft, durable: () => durable };
}

test("unpaired clients see no tools; grants remain fixed when the UI account switches", async () => {
  const f = fixture();
  const pending = f.service.registerClient("未授权");
  assert.equal(f.service.tools(pending.id).length, 0);
  await assert.rejects(f.service.call(pending.id, "works_list", {}), /批准/);
  f.accounts[0].current = false;
  f.accounts[1].current = true;
  assert.deepEqual(await f.call("works_list"), { account: "a" });
  await assert.rejects(f.call("works_list", { account: "b" }), /账号未授权/);
  assert.equal(((await f.call("account_list")) as unknown[]).length, 1);
  assert.equal("token" in (f.service.snapshot().clients[0] ?? {}), false);
  assert.equal(
    f.service.definitions.some((tool) => /login|cookie|logout|delete|settle/.test(tool.name)),
    false,
  );
});

test("runtime schemas reject invalid parameters and unknown fields", async () => {
  const f = fixture();
  await assert.rejects(f.call("works_get", { itemId: "../../123" }), /validation|Invalid|string/);
  await assert.rejects(f.call("works_list", { confirm: true }), /Unrecognized/);
  assert.equal(f.counts.save, 0);
});

test("granted saves execute immediately and retries reuse the completed operation", async () => {
  const f = fixture();
  const draft = await f.draft();
  const changed = (await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  })) as McpDraft;
  const params = { draftId: draft.id, revision: changed.revision, idempotencyKey: "save", submitReview: false };
  const operation = (await f.call("works_save", params)) as McpOperation;
  assert.equal(operation.state, "succeeded");
  assert.equal(f.counts.save, 1);
  assert.equal(f.remote.fields.item_name, "新名称");
  assert.equal(((await f.call("works_save", params)) as McpOperation).id, operation.id);
  assert.equal(f.counts.save, 1);
  assert.equal(
    f.service.snapshot().operations.some((entry) => entry.state === "pending"),
    false,
  );
});

test("host edits and remote conflicts prevent stale writes without a confirmation dialog", async () => {
  const f = fixture();
  const draft = await f.draft();
  f.service.editDraft(draft.id, 1, { item_name: "用户修改" });
  await assert.rejects(f.call("works_save", { draftId: draft.id, revision: 1, idempotencyKey: "stale" }), /版本已变化/);
  f.remote.fields.item_name = "另一客户端已保存";
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "conflict",
  })) as McpOperation;
  assert.equal(operation.state, "failed");
  assert.match(operation.message, /平台内容已变化/);
  assert.equal(f.counts.save, 0);
});

test("foreign drafts, forged receipts, unknown media URLs and script HTML are rejected or cleaned", async () => {
  const f = fixture();
  const draft = await f.draft();
  const second = f.service.registerClient("另一个 AI");
  f.service.connected(second.id, () => {});
  f.service.grant(second.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  await assert.rejects(f.service.call(second.id, "works_draft_preview", { draftId: draft.id }), /不属于/);
  await assert.rejects(
    f.call("works_draft_patch", {
      draftId: draft.id,
      revision: 1,
      section: "images",
      patch: { channel: [{ channel_id: 1, channel_url: { sign: "fake", body: "{}", file_type: "image" } }] },
    }),
    /签名/,
  );
  await assert.rejects(
    f.call("works_draft_patch", {
      draftId: draft.id,
      revision: 1,
      section: "banner",
      patch: { banner_pic: "https://evil.invalid/file" },
    }),
    /媒体必须/,
  );
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "detail",
    patch: { info: '<p onclick="evil()">内容<script>evil()</script></p>' },
  });
  assert.equal(f.service.snapshot().drafts[0]?.previewFields?.info, "<p>内容</p>");
});

test("save then review records each phase and stops after content changes", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  });
  const normal = f.ports.saveWork;
  f.ports.saveWork = async (...args) => {
    await normal(...args);
    f.remote.fields.update_summary = "其他客户端改动";
  };
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "both",
    submitReview: true,
  })) as McpOperation;
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 0);
  assert.equal(operation.state, "failed");
  assert.match(f.service.snapshot().operations[0]?.message ?? "", /保存已成功/);
  const restarted = new McpService(f.durable(), f.ports);
  assert.equal(restarted.snapshot().drafts[0]?.locked, true);
});

test("save and review succeeds once with a fixed approved snapshot", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  });
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "both",
    submitReview: true,
  })) as McpOperation;
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 1);
  assert.equal(operation.state, "succeeded");
});

test("revocation during validation stops the write at the adapter boundary", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  });
  f.ports.saveWork = async (_draft, _patch, guard) => {
    f.service.revoke(f.client.id);
    guard();
    f.counts.save++;
  };
  await assert.rejects(f.call("works_save", { draftId: draft.id, revision: 2, idempotencyKey: "save" }), /批准|授权/);
  assert.equal(f.counts.save, 0);
  assert.equal(f.service.snapshot().operations[0]?.state, "failed");
});

test("unknown results lock drafts; restart preserves unknown writes and expires pending approvals", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  });
  f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "save",
  })) as McpOperation;

  assert.equal(operation.state, "unknown");
  await assert.rejects(f.call("works_save", { draftId: draft.id, revision: 2, idempotencyKey: "retry" }), /待核实/);
  const copy = f.durable();
  assert.ok(copy.operations[0]);
  copy.operations[0].state = "running";
  const restarted = new McpService(copy, f.ports);
  assert.equal(restarted.snapshot().operations[0]?.state, "unknown");
});

test("creation without an ID returns unresolved and cannot accidentally submit review", async () => {
  const f = fixture();
  const draft = (await f.call("works_draft_create", { idempotencyKey: "new" })) as McpDraft;
  const operation = (await f.call("works_create", {
    draftId: draft.id,
    revision: 1,
    idempotencyKey: "create",
  })) as McpOperation;
  assert.equal(operation.state, "created_id_unresolved");
  assert.equal(f.counts.create, 1);
  assert.equal(f.counts.review, 0);
});

test("ungranted writes, expired accounts, disabled plugins and stopped service cannot execute", async () => {
  const f = fixture();
  const draft = await f.draft();
  const params = { draftId: draft.id, revision: 1, idempotencyKey: "denied" };
  f.service.grant(f.client.id, {
    accounts: ["a"],
    defaultAccount: "a",
    permissions: ["netease:works.read", "works:draft"],
  });
  await assert.rejects(f.call("works_save", params), /权限/);
  await assert.rejects(f.call("works_submit_review", params), /权限/);
  await assert.rejects(f.call("works_asset_upload", { ...params, assetId: "missing" }), /权限/);
  await assert.rejects(f.call("income_list", { platform: "pe" }), /权限/);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  f.accounts[0].status = "expired";
  f.service.accountsChanged();
  await assert.rejects(f.call("works_save", params), /过期/);
  f.accounts[0].status = "active";
  f.ports.assertEnabled = () => {
    throw new McpError("forbidden", "插件已停用");
  };
  await assert.rejects(f.call("works_save", params), /插件已停用/);
  f.service.disable();
  await assert.rejects(f.call("works_list"), /服务已关闭/);
  assert.deepEqual(f.counts, { save: 0, create: 0, review: 0, upload: 0 });
});

test("material import bounds paths and keeps a stable copy after the source changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-material-"));
  try {
    const source = join(root, "allowed");
    const outside = join(root, "outside");
    await mkdir(source);
    await mkdir(outside);
    await writeFile(join(source, "a.zip"), "original");
    await writeFile(join(outside, "b.zip"), "outside");
    assert.equal(await resolveMaterial(source, "a.zip"), join(source, "a.zip"));
    await assert.rejects(resolveMaterial(source, "../outside/b.zip"), /授权目录/);
    await assert.rejects(resolveMaterial(source, "a.zip:secret"), /授权目录/);
    await symlink(outside, join(source, "escape"), "junction");
    await assert.rejects(resolveMaterial(source, "escape/b.zip"), /链接|越界/);
    const asset = await snapshotMaterial(join(root, "snapshots"), join(source, "a.zip"), {
      draftId: "draft",
      kind: "resource",
      platform: "pe",
    });
    await writeFile(join(source, "a.zip"), "changed");
    await verifyMaterial(asset);
    assert.equal(await readFile(asset.path, "utf8"), "original");
    await writeFile(asset.path, "tampered");
    await assert.rejects(verifyMaterial(asset), /变化/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SDK negotiates protocol, lists tools and returns typed tool errors", async () => {
  const f = fixture();
  const server = createMcpServer(f.service, f.client.id);
  const client = new Client({ name: "test-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);
    await client.connect(b);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "works_draft_create"));
    assert.ok(tools.tools.every((tool) => tool.inputSchema.type === "object"));
    const success = await client.callTool({ name: "works_list", arguments: {} });
    assert.deepEqual(success.structuredContent, { result: { account: "a" } });
    const denied = await client.callTool({ name: "works_list", arguments: { account: "b" } });
    assert.equal(denied.isError, true);
    const resources = await client.listResources();
    assert.equal(resources.resources[0]?.uri, "glaze://connection");
  } finally {
    await client.close();
    await server.close();
  }
});

test("new drafts cannot bypass unresolved writes until a human reconciles them", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", { draftId: draft.id, revision: 1, section: "basic", patch: { item_name: "修改" } });
  f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "write",
  })) as McpOperation;

  const second = await f.draft("second");
  await assert.rejects(
    f.call("works_save", { draftId: second.id, revision: 1, idempotencyKey: "new-write" }),
    /待核实/,
  );
  f.service.resolveOperation(operation.id);
  assert.equal(
    (
      (await f.call("works_save", {
        draftId: second.id,
        revision: 1,
        idempotencyKey: "after-human-check",
      })) as McpOperation
    ).state,
    "succeeded",
  );
  assert.equal(f.service.snapshot().drafts.find((entry) => entry.id === draft.id)?.locked, true);
});

test("review treats a host upload receipt and its returned media URL as the same approved content", async () => {
  const f = fixture();
  const draft = await f.draft();
  const url = "https://x.nosdn.127.net/a.png";
  f.service.data.assets.push({
    id: "material",
    draftId: draft.id,
    name: "a.png",
    size: 1,
    hash: "hash",
    kind: "image",
    platform: "pe",
    uploaded: true,
    expiresAt: Date.now() + 60000,
    path: "unused",
    receipt: {
      name: "a.png",
      size: 1,
      url,
      receipt: { body: JSON.stringify({ url }), sign: "host-only", file_type: "image" },
    },
  });
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "images",
    patch: { channel: [{ channel_id: 1, channel_url: { $asset: "material", as: "receipt" } }] },
  });
  const save = f.ports.saveWork;
  f.ports.saveWork = async (...args) => {
    await save(...args);
    f.remote.fields.channel = [{ channel_id: 1, channel_url: url }];
  };
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "media-review",
    submitReview: true,
  })) as McpOperation;
  assert.equal(operation.state, "succeeded");
  assert.equal(f.counts.review, 1);
  const publicDraft = await f.call("works_draft_preview", { draftId: draft.id });
  assert.equal(JSON.stringify(publicDraft).includes("host-only"), false);
});

test("HTTP SDK clients connect by URL, stay isolated and receive grant notifications", async () => {
  const f = fixture();
  const http = new McpHttpServer(f.service);
  const endpoint = await http.start(0);
  f.ports.changed = () => http.changed();
  const first = new Client({ name: "Codex", version: "1" });
  const second = new Client({ name: "Codex", version: "1" });
  const firstTransport = new StreamableHTTPClientTransport(new URL(endpoint));
  const secondTransport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await first.connect(firstTransport);
    await second.connect(secondTransport);
    assert.notEqual(firstTransport.sessionId, secondTransport.sessionId);
    assert.equal((await first.listTools()).tools.length, 0);
    assert.equal((await second.listTools()).tools.length, 0);
    const state = await first.readResource({ uri: "glaze://connection" });
    assert.equal(JSON.parse(state.contents[0]?.text as string).approved, false);
    const clients = f.service.snapshot().clients.filter((entry) => entry.name === "Codex");
    assert.equal(clients.length, 2);
    assert.ok(clients[0] && clients[1]);
    assert.ok(firstTransport.sessionId);
    let notified = false;
    first.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      notified = true;
    });
    f.service.grant(clients[0].id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:account.read"] });
    for (let attempt = 0; attempt < 20 && !notified; attempt++) await delay(10);
    assert.equal(notified, true);
    assert.ok((await first.listTools()).tools.some((tool) => tool.name === "account_list"));
    assert.equal((await second.listTools()).tools.length, 0);
    const accounts = await first.callTool({ name: "account_list", arguments: {} });
    assert.ok(accounts.structuredContent);
    assert.equal((accounts.structuredContent.result as AccountSummary[])[0]?.id, "a");
    assert.equal((await first.callTool({ name: "income_list", arguments: {} })).isError, true);
    f.service.revoke(clients[0].id);
    const revoked = await fetch(endpoint, {
      headers: { "mcp-session-id": firstTransport.sessionId, Accept: "text/event-stream" },
    });
    assert.equal(revoked.status, 404);
    await secondTransport.terminateSession();
    assert.equal(f.service.snapshot().clients.find((entry) => entry.id === clients[1]?.id)?.connected, false);
  } finally {
    await first.close();
    await second.close();
    await http.stop();
  }
  assert.equal(f.service.snapshot().endpoint, null);
  await assert.rejects(fetch(endpoint));
});

test("HTTP rejects invalid hosts, origins, routes, sessions and oversized input before registration", async () => {
  const f = fixture();
  const http = new McpHttpServer(f.service);
  const endpoint = await http.start(0);
  const initialCount = f.service.data.clients.length;
  try {
    for (const origin of ["https://evil.example", "null", "http://127.0.0.1:1"]) {
      assert.equal((await fetch(endpoint, { headers: { Origin: origin } })).status, 403);
    }
    const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(endpoint, { headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(hostileHost, 403);
    assert.equal((await fetch(`${endpoint}/wrong`)).status, 404);
    assert.equal((await fetch(endpoint)).status, 400);
    assert.equal((await fetch(endpoint, { method: "OPTIONS" })).status, 405);
    assert.equal((await fetch(endpoint, { headers: { "mcp-session-id": "missing" } })).status, 404);
    assert.equal((await fetch(endpoint, { method: "POST", body: "{}" })).status, 415);
    for (const body of ["{", "{}", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })]) {
      assert.equal(
        (await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body })).status,
        400,
      );
    }
    assert.equal(
      (
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify("x".repeat(3 * 1024 * 1024)),
        })
      ).status,
      413,
    );
    assert.equal(f.service.data.clients.length, initialCount);
  } finally {
    await http.stop();
  }
});

test("HTTP port conflicts fail explicitly; stop and restart release sessions and retain the URL", async () => {
  const f = fixture();
  const first = new McpHttpServer(f.service);
  const other = new McpHttpServer(f.service);
  const endpoint = await first.start(0);
  const port = Number(new URL(endpoint).port);
  const client = new Client({ name: "Restart test", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await assert.rejects(other.start(port), (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE");
    await client.connect(transport);
    const oldId = transport.sessionId;
    assert.ok(oldId);
    f.service.disable();
    await first.stop();
    f.service.data.enabled = true;
    f.service.status = "running";
    assert.equal(await first.start(port), endpoint);
    assert.equal((await fetch(endpoint, { headers: { "mcp-session-id": oldId } })).status, 404);
  } finally {
    await client.close();
    await first.stop();
    await other.stop();
  }
});

test("idle HTTP sessions release slots and new connections never inherit old grants", async () => {
  const f = fixture();
  const http = new McpHttpServer(f.service, 100);
  const endpoint = await http.start(0);
  const client = new Client({ name: "Idle client", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await client.connect(transport);
    const entry = f.service.snapshot().clients.find((item) => item.name === "Idle client");
    assert.ok(entry);
    f.service.grant(entry.id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:account.read"] });
    for (let attempt = 0; attempt < 50 && f.service.connections.has(entry.id); attempt++) await delay(20);
    assert.equal(f.service.connections.has(entry.id), false);
    await client.close();
    const replacement = f.service.registerClient("Idle client");
    assert.equal(replacement.approved, false);
    assert.equal(
      f.service.snapshot().clients.some((item) => item.id === entry.id),
      false,
    );
  } finally {
    await client.close();
    await http.stop();
  }
});

test("SDK save performs the complete rename without UI calls and reports uncertain failures", async () => {
  const f = fixture();
  const server = createMcpServer(f.service, f.client.id);
  const client = new Client({ name: "Direct save test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const created = await client.callTool({
      name: "works_draft_create",
      arguments: { itemId: "123", idempotencyKey: "sdk-draft" },
    });
    const draft = created.structuredContent?.result as McpDraft;
    assert.ok(draft.id);
    await client.callTool({
      name: "works_draft_patch",
      arguments: { draftId: draft.id, revision: 1, section: "basic", patch: { item_name: "MCP测试作品" } },
    });
    const args = { draftId: draft.id, revision: 2, idempotencyKey: "sdk-save" };
    const saved = await client.callTool({ name: "works_save", arguments: args });
    assert.equal(saved.isError, undefined);
    assert.ok(saved.structuredContent);
    assert.equal((saved.structuredContent.result as McpOperation).state, "succeeded");
    assert.equal(f.remote.fields.item_name, "MCP测试作品");
    assert.equal(f.counts.save, 1);
    assert.equal(f.counts.review, 0);
    await client.callTool({ name: "works_save", arguments: args });
    assert.equal(f.counts.save, 1);
    await client.callTool({
      name: "works_draft_patch",
      arguments: { draftId: draft.id, revision: 3, section: "basic", patch: { item_name: "第二次修改" } },
    });
    f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
      beforeWrite();
      throw new McpError("timeout", "超时");
    };
    const failed = await client.callTool({
      name: "works_save",
      arguments: { draftId: draft.id, revision: 4, idempotencyKey: "timeout" },
    });
    assert.equal(failed.isError, true);
    assert.ok(failed.structuredContent);
    assert.equal((failed.structuredContent.result as McpOperation).state, "unknown");
    assert.equal(
      f.service.snapshot().operations.some((op) => op.state === "pending"),
      false,
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test("granted material import and upload execute once without approval requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-direct-upload-"));
  const f = fixture();
  try {
    const path = join(root, "source.png");
    await writeFile(path, "test-material");
    f.ports.assetRoot = join(root, "snapshots");
    f.ports.pickFile = async () => path;
    const draft = await f.draft();
    const imported = (await f.call("works_asset_import", {
      draftId: draft.id,
      revision: 1,
      idempotencyKey: "import",
      kind: "image",
    })) as McpOperation;
    assert.equal(imported.state, "succeeded");
    assert.ok(imported.assetId);
    const args = { draftId: draft.id, revision: 1, idempotencyKey: "upload", assetId: imported.assetId };
    const uploaded = (await f.call("works_asset_upload", args)) as McpOperation;
    assert.equal(uploaded.state, "succeeded");
    await f.call("works_asset_upload", args);
    assert.equal(f.counts.upload, 1);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "glaze-mcp-direct-upload-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("public MCP exposes direct business tools and rejects the removed draft API", async () => {
  const f = fixture(false);
  const names = f.service.tools(f.client.id).map((tool) => tool.name);
  assert.equal(
    names.some((name) => name.startsWith("works_draft_") || name.startsWith("works_asset_")),
    false,
  );
  for (const name of [
    "works_save",
    "works_create",
    "works_upload",
    "works_delete",
    "works_changePrice",
    "promotion_join",
    "promotion_saveBanner",
    "promotion_upload",
    "comments_reply",
    "feedback_reply",
    "messages_delete",
    "analytics_periodIncome",
  ])
    assert.ok(names.includes(name), name);
  await assert.rejects(f.call("works_draft_create", { idempotencyKey: "old" }), /工具不存在/);
  await assert.rejects(
    f.call("works_save", { draftId: "old", revision: 1, idempotencyKey: "old" }),
    /validation|Invalid|Unrecognized/,
  );
});

test("one direct save updates fields, returns no draft identifiers, cleans snapshots and deduplicates", async () => {
  const f = fixture(false);
  const args = {
    itemId: "123",
    patch: { item_name: "直接修改", update_summary: "新纪要" },
    base: { item_name: "原名称" },
    idempotencyKey: "direct",
  };
  const result = (await f.call("works_save", args)) as McpOperation;
  assert.equal(result.state, "succeeded");
  assert.equal(result.itemId, "123");
  assert.equal("draftId" in result, false);
  assert.equal("revision" in result, false);
  assert.equal(f.remote.fields.item_name, "直接修改");
  assert.equal(f.remote.fields.update_summary, "新纪要");
  assert.equal(f.service.data.drafts.length, 0);
  assert.equal(((await f.call("works_save", args)) as McpOperation).id, result.id);
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 0);
  await assert.rejects(f.call("works_save", { ...args, patch: { item_name: "别的" } }), /幂等键/);
  await assert.rejects(f.call("works_save", { ...args, idempotencyKey: "stale" }), /内容已变化/);
  assert.equal(f.service.data.drafts.length, 0);
});

test("direct create, review and save-review keep distinct grants and fail-closed state checks", async () => {
  const f = fixture(false);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: ["works:save"] });
  const args = { itemId: "123", patch: { item_name: "新名称" }, idempotencyKey: "direct", submitReview: true };
  await assert.rejects(f.call("works_save", args), /权限/);
  assert.equal(f.counts.save, 0);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  const saved = (await f.call("works_save", args)) as McpOperation;
  assert.equal(saved.state, "succeeded");
  assert.equal(f.counts.review, 1);
  const created = (await f.call("works_create", {
    fields: { item_name: "新作品" },
    idempotencyKey: "create",
  })) as McpOperation;
  assert.equal(created.state, "created_id_unresolved");
  assert.equal(f.counts.create, 1);
});

test("direct unknown writes remain blocked across new requests without retaining completed drafts", async () => {
  const f = fixture(false);
  f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  const args = { itemId: "123", patch: { item_name: "未知" }, idempotencyKey: "unknown" };
  const result = (await f.call("works_save", args)) as McpOperation;
  assert.equal(result.state, "unknown");
  assert.equal(f.service.data.drafts.length, 1);
  await assert.rejects(f.call("works_save", { ...args, idempotencyKey: "new" }), /待核实/);
  assert.equal(((await f.call("works_save", args)) as McpOperation).id, result.id);
});

test("direct uploads are reusable by their work and cannot cross work or client boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-direct-assets-"));
  const f = fixture(false);
  try {
    const source = join(root, "image.png");
    await writeFile(source, "material");
    f.ports.assetRoot = join(root, "snapshots");
    f.ports.pickFile = async () => source;
    const uploaded = (await f.call("works_upload", {
      itemId: "123",
      kind: "image",
      channelId: 1,
      idempotencyKey: "upload",
    })) as McpOperation;
    assert.equal(uploaded.state, "succeeded");
    assert.ok(uploaded.assetId);
    const patch = { channel: [{ channel_id: 1, channel_url: { $asset: uploaded.assetId, as: "receipt" } }] };
    await assert.rejects(f.call("works_save", { itemId: "456", patch, idempotencyKey: "other-work" }), /材料/);
    const saved = (await f.call("works_save", { itemId: "123", patch, idempotencyKey: "save" })) as McpOperation;
    assert.equal(saved.state, "succeeded");
    assert.equal(JSON.stringify(uploaded).includes("host-only"), false);
    const other = f.service.registerClient("Other");
    f.service.connected(other.id, () => {});
    f.service.grant(other.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
    await assert.rejects(
      f.service.call(other.id, "works_save", { itemId: "123", patch, idempotencyKey: "foreign" }),
      /材料/,
    );
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "glaze-mcp-direct-assets-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("business writes pin the account, deduplicate, honor grants and block unknown retries", async () => {
  const f = fixture(false);
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  f.ports.invoke = async (method, params, guard, beforeWrite) => {
    guard();
    beforeWrite();
    calls.push({ method, params });
    return { outcome: "completed" };
  };
  const args = { id: "comment-1", content: "谢谢反馈", idempotencyKey: "reply" };
  f.accounts[0].current = false;
  f.accounts[1].current = true;
  const result = (await f.call("comments_reply", args)) as McpOperation;
  assert.equal(result.state, "succeeded");
  assert.equal(calls[0]?.params.account, "a");
  assert.equal("idempotencyKey" in (calls[0]?.params ?? {}), false);
  await f.call("comments_reply", args);
  assert.equal(calls.length, 1);
  await assert.rejects(f.call("comments_reply", { ...args, account: "b" }), /账号未授权/);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:community.read"] });
  await assert.rejects(f.call("comments_reply", { ...args, idempotencyKey: "no-grant" }), /权限/);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  f.ports.invoke = async (_m, _p, _g, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  const uncertain = (await f.call("messages_delete", { ids: ["mail-1"], idempotencyKey: "mail" })) as McpOperation;
  assert.equal(uncertain.state, "unknown");
  await assert.rejects(f.call("messages_delete", { ids: ["mail-1"], idempotencyKey: "retry" }), /待核实/);
});

test("business schemas reject invalid status operations, IDs and injection fields before host access", async () => {
  const f = fixture(false);
  let requests = 0;
  f.ports.invoke = async () => {
    requests++;
    return null;
  };
  for (const [name, args] of [
    ["works_delete", { itemId: "123", expectedStatus: "online", idempotencyKey: "delete" }],
    [
      "works_changePrice",
      {
        itemId: "123",
        expectedStatus: "online",
        price: 301,
        expectedPrice: 300,
        expectedPriceType: "diamond",
        idempotencyKey: "price",
      },
    ],
    ["messages_delete", { ids: ["../mail"], idempotencyKey: "mail" }],
    ["comments_reply", { id: "ok", content: "x".repeat(101), idempotencyKey: "comment" }],
    [
      "promotion_join",
      {
        kind: "review",
        activityId: "a",
        moduleId: "b",
        itemIds: ["123"],
        images: [{ sign: "fake" }],
        idempotencyKey: "promo",
      },
    ],
  ] as const)
    await assert.rejects(f.call(name, args), /validation|Invalid|Unrecognized|参数无效|Too big/);
  assert.equal(requests, 0);
});

test("promotion resolves only host-uploaded materials and never exposes signed receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-promo-"));
  const f = fixture(false);
  try {
    const source = join(root, "banner.png");
    await writeFile(source, "banner");
    f.ports.assetRoot = join(root, "snapshots");
    f.ports.pickFile = async () => source;
    const upload = (await f.call("promotion_upload", { kind: "banner", idempotencyKey: "banner" })) as McpOperation;
    assert.equal(upload.state, "succeeded");
    let received: Record<string, unknown> = {};
    f.ports.invoke = async (_m, params, guard, beforeWrite) => {
      guard();
      beforeWrite();
      received = params;
      return undefined;
    };
    const result = (await f.call("promotion_saveBanner", {
      itemId: "123",
      startTime: 1,
      imageAssetId: upload.assetId,
      idempotencyKey: "apply",
    })) as McpOperation;
    assert.equal(result.state, "succeeded");
    assert.equal(received.imageUrl, "https://x.nosdn.127.net/a.png");
    assert.equal("imageAssetId" in received, false);
    const wrong = (await f.call("promotion_join", {
      kind: "discount",
      activityId: "a",
      moduleId: "b",
      itemIds: ["123"],
      imageAssetIds: [upload.assetId],
      idempotencyKey: "wrong-kind",
    })) as McpOperation;
    assert.equal(wrong.state, "failed");
    assert.equal(JSON.stringify(result).includes("host-only"), false);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "glaze-mcp-promo-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("HTTP direct tools serialize their schemas and complete one-call saves without snapshots", async () => {
  const f = fixture(false);
  const http = new McpHttpServer(f.service);
  const endpoint = await http.start(0);
  const client = new Client({ name: "Direct HTTP", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await client.connect(transport);
    const connected = f.service.snapshot().clients.find((entry) => entry.name === "Direct HTTP");
    assert.ok(connected);
    f.service.grant(connected.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
    const tools = await client.listTools();
    assert.equal(
      tools.tools.some((tool) => tool.name.startsWith("works_draft_")),
      false,
    );
    const result = await client.callTool({
      name: "works_save",
      arguments: { itemId: "123", patch: { item_name: "HTTP直接保存" }, idempotencyKey: "http" },
    });
    assert.equal(result.isError, undefined);
    assert.ok(result.structuredContent);
    const operation = result.structuredContent.result as McpOperation;
    assert.equal(operation.state, "succeeded");
    assert.equal("draftId" in operation, false);
    assert.equal(f.remote.fields.item_name, "HTTP直接保存");
  } finally {
    await transport.terminateSession();
    await client.close();
    await http.stop();
  }
});

test("host business adapter checks the fixed account immediately before sending and never leaks credentials", async () => {
  const originalFetch = globalThis.fetch;
  let sent = 0;
  let allowed = true;
  let account = "";
  const invoke = createMcpBusiness({
    request: async (id, call) => {
      account = id ?? "";
      const response = await call({ sessionCookie: "TEST_ONLY_SESSION" });
      if (!response.ok) throw new McpError(response.error.kind, "test platform error");
      return response.value;
    },
  });
  globalThis.fetch = async (url, init) => {
    sent++;
    assert.ok(String(url).endsWith("/items/comment/pe/comment-1/reply"));
    assert.equal(init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(init?.body)), { content: "谢谢" });
    return new Response(JSON.stringify({ status: 200, data: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    let checked = 0;
    const guard = () => {
      if (!allowed) throw new McpError("forbidden", "revoked");
      checked++;
    };
    const result = await invoke(
      "comments.reply",
      { account: "pinned-account", id: "comment-1", content: "谢谢" },
      guard,
      guard,
    );
    assert.equal(result, undefined);
    assert.equal(account, "pinned-account");
    assert.ok(checked >= 3);
    assert.equal(sent, 1);
    allowed = false;
    await assert.rejects(
      invoke("comments.reply", { account: "pinned-account", id: "comment-1", content: "谢谢" }, guard, guard),
      /revoked/,
    );
    assert.equal(sent, 1);
    await assert.rejects(invoke("account.loginWithCookie", {}, guard, guard), /未注册/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
