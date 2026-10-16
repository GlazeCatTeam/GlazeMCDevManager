import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "node_modules/.cache/mcp-tests");
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 0, hmr: false },
  resolve: {
    alias: {
      "react-dom": join(root, "apps/desktop/node_modules/react-dom"),
      react: join(root, "apps/desktop/node_modules/react"),
    },
  },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The fixture installs tests/fixtures/mcp-mock.ts when no bridge exists
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/mcp.html`);

  // A waiting permission request is shown app-wide and continues the AI call once allowed
  const request = page.getByRole("dialog", { name: "Claude Code 需要你的允许" });
  await request.getByText("提交作品审核", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "mcp-request.png") });
  await request.getByRole("button", { name: "一直允许", exact: true }).click();
  await request.waitFor({ state: "hidden" });
  assert.deepEqual(
    await page.evaluate(() => globalThis.__mcpCalls.find((call) => call.method === "mcp.answer")?.params),
    { requestId: "request-a", decision: "always" },
  );

  // Levels replace per-permission checkboxes; switching keeps the account scope
  await page.getByText("自定义", { exact: true }).waitFor();
  await page.getByRole("button", { name: "只看数据", exact: true }).first().click();
  const grant = await page.evaluate(
    () => globalThis.__mcpCalls.findLast((call) => call.method === "mcp.grant")?.params,
  );
  assert.equal(grant.grant.permissions.includes("netease:income.read"), false);
  assert.equal(grant.grant.permissions.includes("works:save"), false);
  assert.deepEqual(grant.grant.accounts, ["account-a"]);
  assert.equal(await page.getByText("临时连接", { exact: true }).count(), 1);
  assert.equal(await page.getByText("等待你允许", { exact: true }).count(), 1);
  await page.getByText("请到开发者平台确认结果", { exact: false }).waitFor();
  await page.screenshot({ path: join(output, "mcp-assistant.png"), fullPage: true });

  // One-click connect preselects a detected tool and the recommended level
  await page.getByRole("button", { name: "连接 AI 工具", exact: true }).click();
  const connect = page.getByRole("dialog", { name: "连接 AI 工具" });
  await connect.getByText("已安装", { exact: true }).first().waitFor();
  assert.equal(await connect.getByRole("button", { name: /Claude Code/ }).getAttribute("aria-pressed"), "true");
  assert.equal(await connect.getByRole("button", { name: /^帮我打理/ }).getAttribute("aria-pressed"), "true");
  await connect.getByRole("button", { name: "一键连接", exact: true }).click();
  const configured = page.getByRole("dialog", { name: "已写入 Claude Code 配置" });
  await configured.getByText("等待 AI 工具连接。请重启该工具，连接成功后这里会自动更新。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "已连接 Claude Code" }).count(), 0);
  assert.equal(await page.getByText("等待 AI 工具连接", { exact: true }).count(), 1);

  // Only a live session in the pushed snapshot turns the configuration success into a connection
  await page.evaluate(() => {
    const client = globalThis.__mcpState.clients.find((entry) => entry.id === "client-new-1");
    client.connected = true;
    client.lastSeen = new Date().toISOString();
    globalThis.__mcpEmit();
  });
  await page.getByRole("dialog", { name: "已连接 Claude Code" }).waitFor();
  await page.getByText("已检测到 AI 工具在线，可以开始使用。", { exact: true }).waitFor();
  await page.evaluate(() => {
    globalThis.__mcpState.clients.find((entry) => entry.id === "client-new-1").connected = false;
    globalThis.__mcpEmit();
  });
  await configured.waitFor();
  await page.getByText("离线 · 上次使用 刚刚", { exact: true }).waitFor();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  assert.deepEqual(
    await page.evaluate(() => globalThis.__mcpCalls.find((call) => call.method === "mcp.connect")?.params),
    { tool: "claude-code", level: "assist" },
  );

  // Unknown tools get a sentence to paste into the AI
  await page.getByRole("button", { name: "连接 AI 工具", exact: true }).click();
  await page.getByRole("button", { name: /其他 AI 工具/ }).click();
  await page.getByRole("button", { name: "生成连接说明", exact: true }).click();
  await page.getByRole("dialog", { name: "等待 AI 工具连接" }).waitFor();
  const prompt = await page.locator("textarea").inputValue();
  assert.match(prompt, /glaze/);
  assert.match(prompt, /key=preview-key/);
  await page.getByRole("button", { name: "完成", exact: true }).click();

  // A failed configuration update can retain an online client but must still report the failed update
  await page.evaluate(() => {
    globalThis.__mcpState.clients.find((entry) => entry.id === "client-new-1").connected = true;
    globalThis.__mcpFailures.connect = "连接配置写入失败；原连接与授权已保留";
    globalThis.__mcpFailures.preserveConnection = true;
    globalThis.__mcpEmit();
  });
  await page.getByRole("button", { name: "连接 AI 工具", exact: true }).click();
  await page.getByRole("button", { name: "一键连接", exact: true }).click();
  await page
    .getByRole("dialog", { name: "连接配置未更新" })
    .getByText("连接配置写入失败；原连接与授权已保留", { exact: true })
    .waitFor();
  await page.getByText("原连接仍在线，可以继续使用原有权限。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "已连接 Claude Code" }).count(), 0);
  assert.equal(await page.evaluate(() => globalThis.__mcpState.clients.length), 3);
  await page.getByRole("button", { name: "完成", exact: true }).click();

  // Port and service switches moved to Settings through the settingsSections contribution point
  await page.getByRole("button", { name: "设置 → AI 连接服务", exact: true }).waitFor();

  // Onboarding appears when nothing is connected
  await page.evaluate(() => {
    globalThis.__mcpState.clients = [];
    globalThis.__mcpEmit();
  });
  await page.getByRole("region", { name: "开始使用" }).waitFor();
  await page.setViewportSize({ width: 720, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(output, "mcp-onboarding.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: AI assistant page, app-wide permission request, levels, configured/waiting/live/disconnected states, fallback prompt",
  );
} finally {
  await browser?.close();
  await server.close();
}
