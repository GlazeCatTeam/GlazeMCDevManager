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
/** Open a fresh SDK session against the running app */
async function open(url, name) {
  const next = new Client({ name, version: "1" });
  const nextTransport = new StreamableHTTPClientTransport(new URL(url));
  await next.connect(nextTransport);
  return { client: next, transport: nextTransport };
}
try {
  application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root });
  const page = await application.firstWindow();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => window.glaze && document.querySelector("button"));
  await application.evaluate(() => globalThis.__seedMcp());
  // Re-read the seeded account through the normal startup RPC instead of keeping the login route
  await page.reload();
  await page.getByRole("button", { name: "AI 助手", exact: true }).click();
  await page.getByRole("region", { name: "开始使用" }).waitFor();
  await page.getByRole("button", { name: "设置 → AI 连接服务", exact: true }).click();
  assert.equal(await page.getByRole("switch", { name: "AI 连接服务" }).getAttribute("aria-checked"), "false");
  await page.getByRole("textbox", { name: "本机端口", exact: true }).fill(String(initialPort));
  await page.getByRole("switch", { name: "AI 连接服务" }).click();
  await page.getByText("连接服务运行中", { exact: false }).waitFor();
  const state = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.equal(state.value.port, initialPort);
  assert.equal(state.value.endpoint, `http://127.0.0.1:${initialPort}/mcp`);
  await page.getByRole("button", { name: "AI 助手", exact: true }).click();

  // "Other" never writes into real AI tool configs, so it is safe to exercise here
  const connected = await page.evaluate(() => window.glaze.rpc("mcp.connect", { tool: "other", level: "assist" }));
  assert.equal(connected.ok, true);
  assert.equal(connected.value.installed, false);
  assert.match(connected.value.endpoint, new RegExp(`^http://127\\.0\\.0\\.1:${initialPort}/mcp\\?key=`));
  assert.ok(connected.value.prompt.includes(connected.value.endpoint));
  const configuredState = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.equal(configuredState.value.clients.find((entry) => entry.id === connected.value.clientId).connected, false);
  await page.getByText("等待 AI 工具连接", { exact: true }).waitFor();
  assert.equal(await page.getByText("AI 已连接", { exact: false }).count(), 0);
  ({ client, transport } = await open(connected.value.endpoint, "伪造名称"));
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  assert.ok(names.includes("glaze_status") && names.includes("works_save") && names.includes("account_list"));
  const status = await client.callTool({ name: "glaze_status", arguments: {} });
  assert.equal(status.structuredContent.result.approved, true);
  assert.equal(status.structuredContent.result.level, "帮我打理");
  const accounts = await client.callTool({ name: "account_list", arguments: {} });
  assert.equal(accounts.structuredContent.result[0].nickname, "MCP 测试账号");
  assert.ok(!JSON.stringify(accounts).includes("TEST_ONLY"));
  // Local archives use the same host state in both directions and require no platform access
  const archivedId = "1000000000000000001";
  const archive = await client.callTool({
    name: "works_archive",
    arguments: { itemId: archivedId, idempotencyKey: "archive-local" },
  });
  assert.equal(archive.structuredContent.result.state, "succeeded");
  const archiveState = await page.evaluate(() =>
    window.glaze.rpc("works.archiveState", { account: "mcp-test-account" }),
  );
  assert.deepEqual(archiveState.value, [archivedId]);
  const blockedWork = await client.callTool({ name: "works_get", arguments: { itemId: archivedId } });
  assert.equal(blockedWork.isError, true);
  assert.equal(JSON.parse(blockedWork.content[0].text).kind, "archived");
  await client.callTool({ name: "works_restore", arguments: { itemId: archivedId, idempotencyKey: "restore-local" } });
  await page.evaluate(
    (itemId) => window.glaze.rpc("works.archive", { account: "mcp-test-account", itemId }),
    archivedId,
  );
  const aiArchiveState = await client.callTool({ name: "works_archiveState", arguments: {} });
  assert.deepEqual(aiArchiveState.structuredContent.result, [archivedId]);
  await client.callTool({ name: "works_restore", arguments: { itemId: archivedId, idempotencyKey: "restore-ui" } });
  await page.getByText("其他 AI 工具", { exact: true }).first().waitFor();
  await page.getByText("使用中", { exact: true }).waitFor();
  await page.getByText("AI 已连接", { exact: false }).waitFor();

  // A missing permission opens the app-wide prompt; denying returns a clear error to the AI
  const card = page.getByRole("article").filter({ hasText: "其他 AI 工具" });
  await card.getByRole("button", { name: "只看数据", exact: true }).click();
  const pending = client.callTool({
    name: "comments_reply",
    arguments: { id: "comment-1", content: "谢谢", idempotencyKey: "deny" },
  });
  const prompt = page.getByRole("dialog", { name: "其他 AI 工具 需要你的允许" });
  await prompt.getByText("回复玩家评论与反馈", { exact: true }).waitFor();
  await prompt.getByRole("button", { name: "拒绝", exact: true }).click();
  const denied = await pending;
  assert.equal(denied.isError, true);
  assert.match(JSON.stringify(denied.content), /拒绝/);

  // Keyless manual connections must be allowed in the app before they see business tools
  const manual = await open(state.value.endpoint, "Cherry Studio");
  assert.deepEqual(
    (await manual.client.listTools()).tools.map((tool) => tool.name),
    ["glaze_status", "glaze_request_access"],
  );
  const ask = page.getByRole("dialog", { name: "Cherry Studio 想连接 Glaze" });
  await ask.waitFor();
  await page.keyboard.press("Escape");
  await ask.waitFor({ state: "hidden" });
  const manualCard = page.getByRole("article").filter({ hasText: "Cherry Studio" });
  await manualCard.getByText("等待你允许", { exact: true }).waitFor();
  const beforeRetry = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  const originalRequest = beforeRetry.value.requests.find((entry) => entry.clientName === "Cherry Studio");
  const waitingAccess = manual.client.callTool({ name: "glaze_request_access", arguments: {} });
  await manualCard.getByRole("button", { name: "重新申请授权", exact: true }).click();
  await ask.waitFor();
  const afterRetry = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.equal(afterRetry.value.requests.length, 1);
  assert.notEqual(afterRetry.value.requests[0].id, originalRequest.id);
  assert.equal(afterRetry.value.clients.find((entry) => entry.name === "Cherry Studio").approved, false);
  // The page remains an independent authorization path after the popup is dismissed
  await page.keyboard.press("Escape");
  await page
    .getByRole("region", { name: "等你允许", exact: true })
    .getByRole("button", { name: "允许连接", exact: true })
    .click();
  await ask.waitFor({ state: "hidden" });
  assert.equal((await waitingAccess).structuredContent.result.outcome, "always");
  await manualCard.getByText("使用中", { exact: true }).waitFor();
  // Both UI and AI failures must reach real persisted diagnostics without copying inputs
  const invalidUiCreate = await page.evaluate(() =>
    window.glaze.rpc("works.create", { invalidField: "TEST_PRIVATE_UI_PAYLOAD" }),
  );
  assert.equal(invalidUiCreate.ok, false);
  const invalidAiCreate = await manual.client.callTool({
    name: "works_create",
    arguments: {
      fields: { item_name: "TEST_PRIVATE_AI_PAYLOAD" },
      idempotencyKey: "log-invalid",
      submitReview: "invalid",
    },
  });
  assert.equal(invalidAiCreate.isError, true);
  const diagnostics = await page.evaluate(() => window.glaze.rpc("logs.list", { level: "all" }));
  assert.equal(diagnostics.ok, true);
  const diagnosticText = diagnostics.value.entries.map((entry) => entry.message).join("\n");
  assert.match(diagnosticText, /操作失败：works.create；类别=validation；原因=新建作品参数无效/);
  assert.match(diagnosticText, /AI 工具调用失败；工具=works_create.*类别=validation/);
  for (const label of [
    "授权请求已创建",
    "授权弹窗已渲染",
    "授权弹窗已关闭",
    "重新申请连接授权",
    "决定=always",
    "决定=deny",
  ])
    assert.ok(diagnosticText.includes(label), label);
  assert.ok(diagnosticText.includes(originalRequest.id));
  assert.ok(diagnosticText.includes(afterRetry.value.requests[0].id));
  assert.doesNotMatch(diagnosticText, /TEST_PRIVATE_UI_PAYLOAD|TEST_PRIVATE_AI_PAYLOAD|TEST_ONLY_NOT_A_REAL_COOKIE/);
  assert.ok((await manual.client.listTools()).tools.some((tool) => tool.name === "account_list"));
  await manual.transport.terminateSession();
  await manual.client.close();
  // Remove this test's offline manual record so the later empty-state check has no unrelated clients
  const manualState = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  const manualClient = manualState.value.clients.find((entry) => entry.name === "Cherry Studio" && !entry.persistent);
  assert.ok(manualClient);
  const removedManual = await page.evaluate(
    (clientId) => window.glaze.rpc("mcp.revoke", { clientId }),
    manualClient.id,
  );
  assert.equal(removedManual.ok, true);

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
  assert.match(conflict.value.error, /已被占用/);
  assert.equal((await client.callTool({ name: "account_list", arguments: {} })).isError, undefined);
  assert.equal(readFileSync(join(directory, "mcp/state.bin")).includes(Buffer.from("MCP 测试账号")), false);
  assert.equal(readFileSync(join(directory, "mcp/state.bin")).includes(Buffer.from("key=")), false);
  assert.deepEqual(errors, []);
  await client.close();
  client = undefined;

  // Clear through the actual renderer/IPC/store path before checking persistence after restart
  const beforeClear = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.ok(beforeClear.value.audit.length > 0);
  await page
    .getByRole("region", { name: "AI 操作记录", exact: true })
    .getByRole("button", { name: "清空记录", exact: true })
    .click();
  const clearAudit = page.getByRole("dialog", { name: "清空 AI 操作记录？", exact: true });
  await clearAudit.getByRole("button", { name: "确认清空", exact: true }).click();
  await clearAudit.waitFor({ state: "hidden" });
  const afterClear = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.deepEqual(afterClear.value.audit, []);
  assert.deepEqual(afterClear.value.operations, beforeClear.value.operations);
  assert.deepEqual(afterClear.value.clients, beforeClear.value.clients);

  // The key keeps the grant across an app restart without re-approval
  await application.close();
  application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root });
  const restarted = await application.firstWindow();
  restarted.setDefaultTimeout(15000);
  await restarted.waitForFunction(() => window.glaze);
  assert.deepEqual((await restarted.evaluate(() => window.glaze.rpc("mcp.snapshot"))).value.audit, []);
  ({ client, transport } = await open(connected.value.endpoint, "重启后"));
  const again = await client.callTool({ name: "glaze_status", arguments: {} });
  assert.equal(again.structuredContent.result.approved, true);
  assert.equal(again.structuredContent.result.level, "只看数据");
  await client.close();
  client = undefined;
  await restarted.getByRole("button", { name: "AI 助手", exact: true }).click();
  await restarted
    .getByRole("article")
    .filter({ hasText: "其他 AI 工具" })
    .getByRole("button", { name: "移除", exact: true })
    .click();
  await restarted.getByRole("dialog", { name: "移除 其他 AI 工具？" }).getByRole("button", { name: "移除" }).click();
  await restarted.getByRole("region", { name: "开始使用" }).waitFor();
  const refused = await fetch(connected.value.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } },
    }),
  });
  assert.equal(refused.status, 401);

  // Moving the port keeps the service usable on the new address
  await restarted.getByRole("button", { name: "设置 → AI 连接服务", exact: true }).click();
  await restarted.getByRole("textbox", { name: "本机端口", exact: true }).fill(String(nextPort));
  await restarted.getByRole("button", { name: "应用", exact: true }).click();
  await restarted.waitForFunction(
    async (port) => (await window.glaze.rpc("mcp.snapshot")).value.port === port,
    nextPort,
  );
  await assert.rejects(fetch(state.value.endpoint));
  const moved = await open(`http://127.0.0.1:${nextPort}/mcp`, "Port switch test");
  assert.deepEqual(
    (await moved.client.listTools()).tools.map((tool) => tool.name),
    ["glaze_status", "glaze_request_access"],
  );
  await moved.transport.terminateSession();
  await moved.client.close();
  console.log(
    "PASS: Electron AI assistant page, keyed one-click client, restart persistence, app-wide permission prompt, manual connection approval, port validation, conflict rollback, removal and port switching",
  );
} finally {
  await new Promise((resolve) => blocked.server.close(resolve));
  await client?.close().catch(() => undefined);
  await transport?.close().catch(() => undefined);
  await application?.close().catch(() => undefined);
  assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}\\glaze-mcp-electron-`));
  rmSync(directory, { recursive: true, force: true });
}
