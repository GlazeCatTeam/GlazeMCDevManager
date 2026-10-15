import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 0, hmr: false },
  resolve: {
    alias: {
      "react-dom": fileURLToPath(new URL("../apps/desktop/node_modules/react-dom", import.meta.url)),
      react: fileURLToPath(new URL("../apps/desktop/node_modules/react", import.meta.url)),
    },
  },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/account-level.html`);
  const card = page.getByRole("region", { name: "开发者等级", exact: true });
  await card.getByText("Lv.18", { exact: true }).waitFor();
  assert.match(await card.innerText(), /3 阶 · 杰出精英/);
  assert.match(await card.innerText(), /贡献月份：2026-09/);
  assert.match(await card.innerText(), /1280\.5678/);
  assert.match(await card.innerText(), /起飞时刻/);
  assert.match(await card.innerText(), /未上榜/);
  assert.match(await card.innerText(), /升阶任务已完成/);
  assert.equal(await card.getByRole("progressbar", { name: "经验 3,000 / 4,000" }).getAttribute("aria-valuenow"), "75");
  await page.getByLabel("读取失败", { exact: true }).check();
  await card.getByRole("button", { name: "刷新", exact: true }).click();
  await card.getByText(/开发者等级加载失败/).waitFor();
  assert.equal(await card.getByRole("progressbar").count(), 0);
  await page.getByLabel("读取失败", { exact: true }).uncheck();
  await card.getByRole("button", { name: "重试", exact: true }).click();
  await card.getByText("Lv.18", { exact: true }).waitFor();

  await page.getByLabel("延迟响应", { exact: true }).check();
  await card.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByLabel("延迟响应", { exact: true }).uncheck();
  await page.getByRole("button", { name: "账号 B", exact: true }).click();
  await card.getByText("正在加载开发者等级…", { exact: true }).waitFor();
  assert.equal(await card.getByText("Lv.18", { exact: true }).count(), 0);
  assert.equal(await card.getByText("升阶任务未完成", { exact: true }).count(), 0);
  await card.getByText("Lv.25", { exact: true }).waitFor();
  await page.waitForFunction(() => globalThis.levelTest.completed() === globalThis.levelTest.requests());
  assert.match(await card.innerText(), /8 阶/);
  assert.match(await card.innerText(), /等级 8/);
  assert.match(await card.innerText(), /暂无贡献数据/);
  assert.match(await card.innerText(), /升阶任务未完成/);
  assert.equal(await card.getByText("Lv.18", { exact: true }).count(), 0);
  assert.equal(await card.getByRole("progressbar").getAttribute("aria-valuenow"), "0");

  await page.getByLabel("延迟响应", { exact: true }).uncheck();
  await page.getByRole("button", { name: "账号 A", exact: true }).click();
  await card.getByText("Lv.18", { exact: true }).waitFor();
  await page.setViewportSize({ width: 1100, height: 1000 });
  assert.equal(await card.evaluate((element) => element.scrollHeight <= element.clientHeight), true);
  await page.screenshot({ path: `${root}node_modules/.cache/account-level.png`, fullPage: true });
  await page.getByRole("button", { name: "退出测试账号", exact: true }).click();
  await page.getByText("尚未登录账号", { exact: true }).waitFor();
  assert.equal(await card.count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: level data, progress, grades, retry, missing data, delayed account isolation, logout and layout");
} finally {
  await browser?.close();
  await server.close();
}
