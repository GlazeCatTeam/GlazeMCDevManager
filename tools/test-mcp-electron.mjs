import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";

const { _electron: electron } = await import(process.argv[2] ?? "playwright");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "glaze-mcp-electron-"));
const entry = join(directory, "launch.cjs");
const output = join(root, "node_modules/.cache/mcp-tests");
mkdirSync(output, { recursive: true });
writeFileSync(
  entry,
  `const { app, BrowserWindow, safeStorage } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const { join } = require('node:path');
app.setPath('userData', ${JSON.stringify(directory)});
app.commandLine.removeSwitch('use-mock-keychain');
app.commandLine.removeSwitch('password-store');
BrowserWindow.prototype.show = function() {};
globalThis.fetch = async () => { throw new Error('Network disabled during MCP integration test'); };
globalThis.__seedMcp = () => {
  const db = new DatabaseSync(join(app.getPath('userData'), 'glaze.db'));
  db.prepare('INSERT OR REPLACE INTO accounts (id, nickname, login_method, last_login_at, status, is_current) VALUES (?, ?, ?, ?, ?, ?)').run('mcp-test-account', 'MCP 测试账号', 'cookie', 1, 'active', 1);
  db.prepare('INSERT OR REPLACE INTO credentials (account_id, session_blob, updated_at) VALUES (?, ?, ?)').run('mcp-test-account', safeStorage.encryptString('TEST_ONLY_NOT_A_REAL_COOKIE'), 1);
  db.close();
};
import(${JSON.stringify(new URL("../apps/desktop/out/main/index.js", import.meta.url).href)});
`,
);
/** Allocate isolated test ports without changing production listener behavior */
async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, port: server.address().port };
}
const blocked = await reservePort();
const initial = await reservePort();
const initialPort = initial.port;
await new Promise((resolve) => initial.server.close(resolve));
const next = await reservePort();
const nextPort = next.port;
await new Promise((resolve) => next.server.close(resolve));
let application;
let client;
let transport;
try {
  application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root });
  const page = await application.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => window.glaze && document.querySelector("button"));
  await application.evaluate(() => globalThis.__seedMcp());
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "AI 接入", exact: true }).click();
  await page.getByRole("switch", { name: "MCP 服务" }).waitFor();
  assert.equal(await page.getByRole("switch", { name: "MCP 服务" }).getAttribute("aria-checked"), "false");
  await page.getByRole("textbox", { name: "MCP 端口", exact: true }).fill(String(initialPort));
  await page.getByRole("button", { name: "启用服务", exact: true }).click();
  await page.getByText("运行中", { exact: true }).waitFor();
  const state = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.equal(state.ok, true);
  assert.equal(state.value.clients.length, 0);
  assert.equal(state.value.port, initialPort);
  assert.equal(state.value.endpoint, `http://127.0.0.1:${initialPort}/mcp`);
  assert.equal(await page.getByRole("textbox", { name: "MCP 连接地址" }).inputValue(), state.value.endpoint);
  transport = new StreamableHTTPClientTransport(new URL(state.value.endpoint));
  client = new Client({ name: "Codex", version: "1" });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 0);
  await page.getByRole("button", { name: "授权", exact: true }).click();
  const grant = page.getByRole("dialog", { name: "Codex · 账号与权限", exact: true });
  await grant.getByText("MCP 测试账号", { exact: false }).first().waitFor();
  assert.equal(await grant.getByRole("checkbox", { name: "收益与结算查询", exact: true }).isChecked(), false);
  for (const label of [
    "作品发布、撤回、定价、自测与删除",
    "回复玩家评论与反馈",
    "系统消息已读与删除",
    "活动报名、推广材料与轮播图申请",
  ]) {
    assert.equal(await grant.getByRole("checkbox", { name: label, exact: true }).isChecked(), false);
  }
  assert.equal(await grant.getByRole("checkbox", { name: /草稿/ }).count(), 0);
  await grant.getByRole("button", { name: "保存授权", exact: true }).click();
  await grant.waitFor({ state: "hidden" });
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "account_list"));
  assert.ok(!tools.tools.some((tool) => tool.name === "income_list"));
  assert.ok(tools.tools.some((tool) => tool.name === "comments_list"));
  assert.ok(!tools.tools.some((tool) => tool.name === "comments_reply"));
  assert.ok(!tools.tools.some((tool) => tool.name.startsWith("works_draft_")));
  assert.equal(await page.getByRole("region", { name: "AI 草稿", exact: true }).count(), 0);
  const accounts = await client.callTool({ name: "account_list", arguments: {} });
  assert.equal(accounts.structuredContent.result[0].nickname, "MCP 测试账号");
  assert.ok(!JSON.stringify(accounts).includes("TEST_ONLY"));
  for (const port of [0, 65536, 1.5, "19133"]) {
    const invalid = await page.evaluate((port) => window.glaze.rpc("mcp.setEnabled", { enabled: true, port }), port);
    assert.equal(invalid.ok, false);
  }
  const conflict = await page.evaluate(
    (port) => window.glaze.rpc("mcp.setEnabled", { enabled: true, port }),
    blocked.port,
  );
  assert.equal(conflict.value.status, "running");
  assert.equal(conflict.value.port, initialPort);
  assert.equal(conflict.value.endpoint, state.value.endpoint);
  assert.match(conflict.value.error, /已被占用/);
  assert.equal((await client.callTool({ name: "account_list", arguments: {} })).isError, undefined);
  const denied = await client.callTool({ name: "income_list", arguments: { platform: "pe" } });
  assert.equal(denied.isError, true);
  assert.equal(readFileSync(join(directory, "mcp/state.bin")).includes(Buffer.from("MCP 测试账号")), false);
  const info = await client.callTool({ name: "account_current", arguments: {} });
  assert.equal(info.isError, undefined);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "撤销授权", exact: true }).click();
  await page.getByText("暂无客户端连接", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await client.close();
  client = undefined;
  await page.getByRole("textbox", { name: "MCP 端口", exact: true }).fill(String(nextPort));
  await page.getByRole("button", { name: "应用端口", exact: true }).click();
  await page.waitForFunction(
    (port) => document.querySelector('[aria-label="MCP 连接地址"]').value.includes(`:${port}/`),
    nextPort,
  );
  await assert.rejects(fetch(state.value.endpoint));
  client = new Client({ name: "Port switch test", version: "1" });
  transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${nextPort}/mcp`));
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 0);
  await transport.terminateSession();
  await client.close();
  client = undefined;
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "撤销授权", exact: true }).click();
  await application.close();
  application = undefined;
  application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root });
  const restarted = await application.firstWindow();
  await restarted.waitForFunction(() => window.glaze);
  const recovered = await restarted.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.equal(recovered.ok, true);
  assert.equal(recovered.value.clients.length, 0);
  assert.ok(recovered.value.audit.length > 0);
  assert.equal(recovered.value.port, nextPort);
  assert.equal(recovered.value.endpoint, `http://127.0.0.1:${nextPort}/mcp`);
  console.log(
    "PASS: Electron UI, encrypted persistence, Streamable HTTP, SDK handshake, account grants, income denial, port validation, conflict rollback, port switching, revocation and restart",
  );
} finally {
  await new Promise((resolve) => blocked.server.close(resolve));
  await client?.close().catch(() => undefined);
  await transport?.close().catch(() => undefined);
  await application?.close().catch(() => undefined);
  assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}\\glaze-mcp-electron-`));
  rmSync(directory, { recursive: true, force: true });
}
