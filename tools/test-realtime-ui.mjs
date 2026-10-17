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
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 0 },
  resolve: {
    alias: {
      "react-dom": fileURLToPath(new URL("../apps/desktop/node_modules/react-dom", import.meta.url)),
      react: fileURLToPath(new URL("../apps/desktop/node_modules/react", import.meta.url)),
    },
  },
});
/** Loading never presents a previous period's totals, timestamp or order details */
async function expectLoading(panel) {
  await panel.getByText("正在查询平台数据…", { exact: true }).waitFor();
  await panel.getByRole("region", { name: "正在加载分析内容", exact: true }).waitFor();
  assert.equal(await panel.getByRole("table").count(), 0);
  assert.equal(await panel.getByText("钻石收益", { exact: true }).isVisible(), false);
  assert.equal(await panel.getByText("平台订单数", { exact: true }).isVisible(), false);
  assert.doesNotMatch(await panel.innerText(), /最近更新|成功 ·|暂显示/);
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.clock.setFixedTime(new Date("2026-10-17T12:00:00+08:00"));
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
  await expectLoading(panel);
  await panel.getByText("110 成功 · 0 失败").waitFor();
  assert.deepEqual(
    await page.evaluate(() => globalThis.__realtimeRequests.map((request) => request.resourceIds.length)),
    [110, 25],
  );
  await panel.getByRole("button", { name: "全部 110", exact: true }).click();
  await panel.getByRole("button", { name: "查看订单", exact: true }).first().click();
  await panel.getByRole("combobox", { name: "标价货币", exact: true }).selectOption("unknown");
  assert.ok((await panel.getByText(/100 币种未提供/).count()) > 0);
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
  assert.equal(
    await page.evaluate(() => globalThis.__realtimeRequests.at(-1).resourceIds.length),
    110,
    "returning after a retry reloads the entire day",
  );
  await panel.getByRole("button", { name: "仅重试失败资源", exact: true }).click();
  await panel.getByText("110 成功 · 0 失败").waitFor();
  await page.getByRole("button", { name: "模拟请求失败", exact: true }).click();
  await panel.getByRole("button", { name: "刷新收益", exact: true }).click();
  await expectLoading(panel);
  await panel.getByText("本次更新失败，当前显示上次成功查询的数据。").waitFor();
  await panel.getByText("110 成功 · 0 失败").waitFor();
  await page.getByRole("button", { name: "恢复请求", exact: true }).click();
  await panel.getByRole("button", { name: "昨天", exact: true }).click();
  await expectLoading(panel);
  await page.screenshot({ path: `${output}/realtime-loading.png`, fullPage: true });
  await page.waitForFunction(() => globalThis.__realtimeRequests.length === 6);
  await panel.getByRole("button", { name: "今天", exact: true }).click();
  await panel.getByText("85 成功 · 25 失败").waitFor();
  await page.waitForTimeout(1300);
  const dates = await page.evaluate(() => globalThis.__realtimeRequests.map((request) => request.date));
  assert.equal(dates.at(-1), dates[0]);
  assert.notEqual(dates.at(-2), dates[0]);
  await panel.getByText(`${dates[0]} · 北京时间 · 当日未完结`).waitFor();
  // Periods include today, preserve failed-resource retry bounds and stage custom edits until Apply
  await panel.getByRole("button", { name: "近 7 天", exact: true }).click();
  await panel.getByText("85 成功 · 25 失败").waitFor();
  await panel.getByText("2026-10-11 — 2026-10-17 · 北京时间 · 当日未完结").waitFor();
  await page.waitForFunction(() => __realtimeRequests.at(-1)?.endDate === "2026-10-17");
  assert.equal(await page.evaluate(() => __realtimeRequests.at(-1).date), "2026-10-11");
  await panel.getByRole("button", { name: "仅重试失败资源", exact: true }).click();
  await panel.getByText("110 成功 · 0 失败").waitFor();
  assert.deepEqual(
    await page.evaluate(() => {
      const { date, endDate, resourceIds } = __realtimeRequests.at(-1);
      return [date, endDate, resourceIds.length];
    }),
    ["2026-10-11", "2026-10-17", 25],
  );
  await panel.getByRole("button", { name: "近 30 天", exact: true }).click();
  await expectLoading(panel);
  await page.waitForFunction(() => __realtimeRequests.at(-1)?.date === "2026-09-18");
  await panel.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  const requestCount = await page.evaluate(() => __realtimeRequests.length);
  await panel.getByRole("button", { name: "自定义", exact: true }).click();
  const calendar = panel.getByRole("dialog", { name: "自定义日期范围" });
  await calendar.getByLabel("开始日期", { exact: true }).fill("2026-10-01");
  await calendar.getByLabel("结束日期", { exact: true }).fill("2026-10-05");
  await calendar.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.evaluate(() => __realtimeRequests.length), requestCount);
  await panel.getByRole("button", { name: "自定义", exact: true }).click();
  await calendar.getByLabel("开始日期", { exact: true }).fill("2026-10-18");
  await calendar.getByLabel("结束日期", { exact: true }).fill("2026-10-19");
  assert.equal(await calendar.getByRole("button", { name: "应用", exact: true }).isDisabled(), true);
  await calendar.getByLabel("开始日期", { exact: true }).fill("2026-10-01");
  await calendar.getByLabel("结束日期", { exact: true }).fill("2026-10-17");
  assert.equal(await calendar.getByRole("button", { name: "应用", exact: true }).isEnabled(), true);
  await calendar.getByRole("button", { name: "应用", exact: true }).click();
  await page.waitForFunction(() => __realtimeRequests.at(-1)?.date === "2026-10-01");
  await panel.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  assert.equal(await panel.getByRole("button", { name: "自定义", exact: true }).getAttribute("aria-pressed"), "true");
  await page.reload();
  await panel.getByText("2026-10-01 — 2026-10-17 · 北京时间 · 当日未完结").waitFor();
  await panel.getByText("85 成功 · 25 失败").waitFor();
  await page.screenshot({ path: `${output}/realtime-period.png`, fullPage: true });
  await panel.getByRole("button", { name: "自定义", exact: true }).click();
  await page.screenshot({ path: `${output}/realtime-calendar.png` });
  assert.equal(await calendar.getByLabel("开始日期", { exact: true }).inputValue(), "");
  assert.equal(await calendar.getByLabel("结束日期", { exact: true }).inputValue(), "");
  const beforeEndChange = await page.evaluate(() => __realtimeRequests.length);
  await calendar.getByLabel("结束日期", { exact: true }).fill("2026-10-16");
  assert.equal(await calendar.getByRole("button", { name: "应用", exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => __realtimeRequests.length), beforeEndChange);
  await calendar.getByLabel("开始日期", { exact: true }).fill("2026-10-01");
  await calendar.getByRole("button", { name: "应用", exact: true }).click();
  await page.waitForFunction(() => __realtimeRequests.at(-1)?.endDate === "2026-10-16");
  await panel.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => __realtimeRequests.at(-1).date),
    "2026-10-01",
    "changing only the end date issues a separate interval query",
  );
  await panel.getByRole("button", { name: "今天", exact: true }).click();
  await panel.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  assert.equal(await panel.getByRole("button", { name: "自定义", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal(await page.evaluate(() => __realtimeRequests.at(-1).endDate), undefined);
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
    await page
      .getByRole("button", { name: "查看订单", exact: true })
      .first()
      .evaluate((button) => button.click());
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.scrollY), 0, "opening orders must not scroll the document");
    const after = await page.getByTestId("sidebar").boundingBox();
    assert.equal(after.y, before.y, "sidebar stays anchored");
    assert.equal((await page.getByTestId("titlebar").boundingBox()).y, 0, "titlebar stays visible");
    const main = await page.locator("main").boundingBox();
    const orders = await page.getByText("订单明细", { exact: true }).boundingBox();
    assert.ok(
      orders.y >= main.y && orders.y < Math.min(main.y + main.height, 802),
      "order heading is visible inside the content area",
    );
    const contentScroll = await page.locator("main").evaluate((element) => element.scrollTop);
    await page.getByRole("button", { name: /^资源 测试资源/ }).evaluate((button) => button.click());
    await page.getByRole("combobox", { name: "搜索资源", exact: true }).press("ArrowDown");
    assert.equal(
      await page.locator("main").evaluate((element) => element.scrollTop),
      contentScroll,
      "resource options scroll only their own list",
    );
    await page.getByRole("combobox", { name: "搜索资源", exact: true }).press("Escape");
    await page
      .getByRole("button", { name: "查看订单", exact: true })
      .last()
      .evaluate((button) => button.click());
    // Poll instead of a fixed wait: under a loaded machine the scroll into view can land later
    const ordersInView = async () => {
      const box = await page.getByText("订单明细", { exact: true }).boundingBox();
      return !!box && box.y >= main.y && box.y < Math.min(main.y + main.height, 802);
    };
    let positioned = false;
    for (const started = Date.now(); !positioned && Date.now() - started < 5000; ) {
      positioned = await ordersInView();
      if (!positioned) await page.waitForTimeout(100);
    }
    assert.ok(positioned, "shorter or empty order lists are positioned after layout updates");
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    await page.getByRole("button", { name: "查看失败资源", exact: true }).evaluate((button) => button.click());
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.scrollY), 0, "failure navigation must not scroll the document");
    await page.getByRole("button", { name: "全部 110", exact: true }).evaluate((button) => button.click());
  }
  await page.screenshot({ path: `${output}/realtime-shell-scroll.png` });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 110 resources, failure recovery, currency/resource filters, 7/30-day periods, staged custom calendar, persisted scope, end-date isolation, date/account isolation, narrow layout, stationary desktop shell and nested scrolling at 100/125/150% zoom",
  );
} finally {
  await browser?.close();
  await server.close();
}
