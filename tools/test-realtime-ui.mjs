import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/realtime-tests`;
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false, root, logLevel: "warn", plugins: [react()],
  server: { host: "127.0.0.1", port: 0 },
  resolve: { alias: {
    "react-dom": fileURLToPath(new URL("../apps/desktop/node_modules/react-dom", import.meta.url)),
    react: fileURLToPath(new URL("../apps/desktop/node_modules/react", import.meta.url)),
  } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/analytics.html?realtime&slow-yesterday`);
  await page.getByRole("tab", { name: "实时收益", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "实时收益" });
  await panel.getByText("85 成功 · 25 失败").waitFor();
  assert.equal(await page.evaluate(() => globalThis.__realtimeRequests.length), 1, "StrictMode shares initial request");
  await panel.getByRole("button", { name: "查看失败资源", exact: true }).click();
  assert.equal(await panel.getByText("网易平台响应超时，请稍后重试", { exact: true }).count(), 8);
  await page.screenshot({ path: `${output}/realtime-failures.png`, fullPage: true });
  await panel.getByRole("button", { name: "仅重试失败资源", exact: true }).click();
  await panel.getByText("110 成功 · 0 失败").waitFor();
  assert.deepEqual(await page.evaluate(() => globalThis.__realtimeRequests.map((request) => request.resourceIds.length)), [110, 25]);
  await panel.getByRole("button", { name: "全部 110", exact: true }).click();
  await panel.getByRole("button", { name: "查看订单", exact: true }).first().click();
  await panel.getByRole("combobox", { name: "标价货币", exact: true }).selectOption("unknown");
  assert.ok(await panel.getByText(/100 币种未提供/).count() > 0);
  await panel.getByRole("button", { name: /^资源 测试资源/ }).click();
  await panel.getByRole("combobox", { name: "搜索资源", exact: true }).fill("资源 110");
  assert.equal(await panel.getByRole("dialog", { name: "选择资源" }).getByRole("option").count(), 1);
  await panel.getByRole("dialog", { name: "选择资源" }).getByRole("option").click();
  await panel.getByRole("button", { name: "查看全部资源", exact: true }).click();
  await panel.getByRole("combobox", { name: "排序", exact: true }).selectOption("emeralds");
  await page.screenshot({ path: `${output}/realtime-success.png`, fullPage: true });
  await panel.getByRole("button", { name: "昨天", exact: true }).click();
  await page.waitForFunction(() => globalThis.__realtimeRequests.length === 3);
  await panel.getByRole("button", { name: "今天", exact: true }).click();
  await panel.getByText("85 成功 · 25 失败").waitFor();
  assert.equal(await page.evaluate(() => globalThis.__realtimeRequests.at(-1).resourceIds.length), 110, "returning after a retry reloads the entire day");
  await panel.getByRole("button", { name: "仅重试失败资源", exact: true }).click();
  await panel.getByText("110 成功 · 0 失败").waitFor();
  await page.getByRole("button", { name: "模拟请求失败", exact: true }).click();
  await panel.getByRole("button", { name: "刷新收益", exact: true }).click();
  await panel.getByText("本次更新失败，当前显示上次成功查询的数据。").waitFor();
  await panel.getByText("110 成功 · 0 失败").waitFor();
  await page.getByRole("button", { name: "恢复请求", exact: true }).click();
  await panel.getByRole("button", { name: "昨天", exact: true }).click();
  assert.equal(await panel.getByText("110 成功 · 0 失败").count(), 0, "new dates cannot display previous totals");
  await page.waitForFunction(() => globalThis.__realtimeRequests.length === 6);
  await panel.getByRole("button", { name: "今天", exact: true }).click();
  await panel.getByText("85 成功 · 25 失败").waitFor();
  await page.waitForTimeout(1300);
  const dates = await page.evaluate(() => globalThis.__realtimeRequests.map((request) => request.date));
  assert.equal(dates.at(-1), dates[0]);
  assert.notEqual(dates.at(-2), dates[0]);
  await panel.getByText(`${dates[0]} · 北京时间 · 当日未完结`).waitFor();
  await page.setViewportSize({ width: 900, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/realtime-narrow.png`, fullPage: true });
  await panel.getByRole("button", { name: "仅重试失败资源", exact: true }).click();
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText(/当前账号暂无可分析的手游资源/).waitFor();
  await page.waitForTimeout(600);
  assert.equal(await page.getByText("110 成功 · 0 失败").count(), 0);
  await page.setViewportSize({ width: 1280, height: 802 });
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/analytics.html?realtime&shell`);
  await page.getByRole("tab", { name: "实时收益", exact: true }).click();
  await page.getByText("85 成功 · 25 失败").waitFor();
  // Exercise programmatic navigation in the actual desktop flex/scroll layout, including CSS zoom
  for (const zoom of [1, 1.25, 1.5]) {
    await page.evaluate((value) => {
      document.documentElement.style.zoom = String(value);
      document.querySelector("main").scrollTop = 0;
      window.scrollTo(0, 0);
    }, zoom);
    const before = await page.getByTestId("sidebar").boundingBox();
    await page.getByRole("button", { name: "查看订单", exact: true }).first().evaluate((button) => button.click());
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.scrollY), 0, "opening orders must not scroll the document");
    const after = await page.getByTestId("sidebar").boundingBox();
    assert.equal(after.y, before.y, "sidebar stays anchored");
    assert.equal((await page.getByTestId("titlebar").boundingBox()).y, 0, "titlebar stays visible");
    const main = await page.locator("main").boundingBox();
    const orders = await page.getByText("订单明细", { exact: true }).boundingBox();
    assert.ok(orders.y >= main.y && orders.y < Math.min(main.y + main.height, 802), "order heading is visible inside the content area");
    const contentScroll = await page.locator("main").evaluate((element) => element.scrollTop);
    await page.getByRole("button", { name: /^资源 测试资源/ }).evaluate((button) => button.click());
    await page.getByRole("combobox", { name: "搜索资源", exact: true }).press("ArrowDown");
    assert.equal(await page.locator("main").evaluate((element) => element.scrollTop), contentScroll, "resource options scroll only their own list");
    await page.getByRole("combobox", { name: "搜索资源", exact: true }).press("Escape");
    await page.getByRole("button", { name: "查看订单", exact: true }).last().evaluate((button) => button.click());
    await page.waitForTimeout(800);
    const emptyOrders = await page.getByText("订单明细", { exact: true }).boundingBox();
    assert.ok(emptyOrders.y >= main.y && emptyOrders.y < Math.min(main.y + main.height, 802), "shorter or empty order lists are positioned after layout updates");
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    await page.getByRole("button", { name: "查看失败资源", exact: true }).evaluate((button) => button.click());
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.scrollY), 0, "failure navigation must not scroll the document");
    await page.getByRole("button", { name: "全部 110", exact: true }).evaluate((button) => button.click());
  }
  await page.screenshot({ path: `${output}/realtime-shell-scroll.png` });
  assert.deepEqual(errors, []);
  console.log("PASS: 110 resources, failure recovery, currency/resource filters, date/account isolation, narrow layout, stationary desktop shell and nested scrolling at 100/125/150% zoom");
} finally {
  await browser?.close();
  await server.close();
}
