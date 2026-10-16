import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

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
  await page.getByRole("switch", { name: "MCP 服务" }).click();
  await page.getByText("运行中", { exact: true }).waitFor();
  await page.getByRole("button", { name: "连接 AI 工具", exact: true }).click();
  await page.getByRole("button", { name: "生成连接配置", exact: true }).click();
  await page.getByRole("textbox", { name: "MCP 连接配置" }).waitFor();
  const state = await page.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.equal(state.ok, true);
  const id = state.value.clients[0].id;
  assert.ok(!(await page.getByRole("textbox", { name: "MCP 连接配置" }).inputValue()).includes("token"));
  transport = new StdioClientTransport({
    command: require("electron"),
    args: [join(root, "apps/desktop/out/main/mcp-bridge.js"), "--mcp-root", join(directory, "mcp"), "--mcp-client", id],
    env: { ELECTRON_RUN_AS_NODE: "1" },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  client = new Client({ name: "Glaze MCP integration test", version: "1" });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 0);
  await page.getByRole("button", { name: "设置授权", exact: true }).click();
  const grant = page.getByRole("dialog", { name: "Codex · 账号与权限", exact: true });
  await grant.getByText("MCP 测试账号", { exact: false }).first().waitFor();
  assert.equal(await grant.getByRole("checkbox", { name: "收益与结算查询", exact: true }).isChecked(), false);
  await grant.getByRole("button", { name: "保存授权", exact: true }).click();
  await grant.waitFor({ state: "hidden" });
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "account_list"));
  assert.ok(!tools.tools.some((tool) => tool.name === "income_list"));
  const accounts = await client.callTool({ name: "account_list", arguments: {} });
  assert.equal(accounts.structuredContent.result[0].nickname, "MCP 测试账号");
  assert.ok(!JSON.stringify(accounts).includes("TEST_ONLY"));
  const denied = await client.callTool({ name: "income_list", arguments: { platform: "pe" } });
  assert.equal(denied.isError, true);
  assert.equal(readFileSync(join(directory, "mcp/state.bin")).includes(Buffer.from("MCP 测试账号")), false);
  const info = await client.callTool({ name: "account_current", arguments: {} });
  assert.equal(info.isError, undefined);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "撤销授权", exact: true }).click();
  await page.getByText("暂无已授权客户端", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await client.close();
  client = undefined;
  await application.close();
  application = undefined;
  application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root });
  const restarted = await application.firstWindow();
  await restarted.waitForFunction(() => window.glaze);
  const recovered = await restarted.evaluate(() => window.glaze.rpc("mcp.snapshot"));
  assert.equal(recovered.ok, true);
  assert.equal(recovered.value.clients.length, 0);
  assert.ok(recovered.value.audit.length > 0);
  console.log(
    "PASS: Electron UI, DPAPI persistence, stdio bridge, SDK handshake, account grants, income denial, revocation and restart",
  );
} finally {
  await client?.close().catch(() => undefined);
  await transport?.close().catch(() => undefined);
  await application?.close().catch(() => undefined);
  assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}\\glaze-mcp-electron-`));
  rmSync(directory, { recursive: true, force: true });
}
