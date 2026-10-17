import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/analytics-ui`;
mkdirSync(output, { recursive: true });
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
  browser = await chromium.launch({ headless: true, channel: process.argv[3] ?? "msedge" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.clock.setFixedTime(new Date("2026-10-16T12:00:00+08:00"));
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/analytics.html?dense&period`);
  const tracking = page.getByRole("tabpanel", { name: "数据追踪", exact: true });
  await tracking.getByRole("table").waitFor();
  assert.equal(
    await page.evaluate(() => __analyticsTest.requests.filter((r) => r.method === "analytics.daily").length),
    1,
  );
  assert.equal(await tracking.getByRole("button", { name: "查询数据", exact: true }).count(), 0);
  // A cached date range appears synchronously; rapid cold ranges issue only the final request
  const before = await page.evaluate(() => __analyticsTest.requests.length);
  await tracking.getByRole("button", { name: "近 7 天", exact: true }).click();
  await tracking.getByRole("button", { name: "近 30 天", exact: true }).click();
  assert.equal(await tracking.getByRole("table").count(), 1, "cold filters keep the previous result visible");
  await tracking.getByText(/暂显示/).waitFor();
  await tracking.getByText(/共 3 个资源 · 30 天/).waitFor();
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), before + 1);
  await tracking.getByRole("button", { name: "近 14 天", exact: true }).click();
  assert.equal(await tracking.getByRole("table").count(), 1);
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), before + 1);
  await tracking.getByRole("button", { name: "选择资源", exact: true }).click();
  await tracking.getByRole("searchbox", { name: "搜索对比资源", exact: true }).fill("资源 18");
  await tracking.getByRole("checkbox").check();
  await tracking.getByText(/共 4 个资源 · 14 天/).waitFor();
  await tracking.getByRole("button", { name: "收起资源", exact: true }).click();
  assert.equal(await tracking.getByRole("table").getByRole("row").count(), 5);
  const legend = tracking.getByRole("group", { name: "图表系列，点击切换显示" });
  await legend.getByRole("button").first().click();
  assert.equal(await legend.getByRole("button").first().getAttribute("aria-pressed"), "false");
  const chart = tracking.getByRole("slider");
  await chart.focus();
  await page.keyboard.press("Home");
  const datePicker = tracking.getByRole("combobox", { name: "查看数值", exact: true });
  const pinned = await datePicker.inputValue();
  const geometry = await chart.boundingBox();
  await page.evaluate(() => {
    __analyticsTest.controls.delay = 900;
  });
  await page.getByRole("button", { name: "模拟请求失败", exact: true }).click();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await tracking.getByText("正在后台更新，当前结果仍可查看", { exact: true }).waitFor();
  assert.equal(await tracking.getByRole("table").count(), 1);
  assert.equal((await chart.boundingBox()).height, geometry.height);
  await tracking.getByText(/数据加载失败/).waitFor();
  assert.equal(await datePicker.inputValue(), pinned, "refresh failure keeps pinned chart date");
  assert.equal(await tracking.getByRole("table").getByRole("row").count(), 5);
  await page.getByRole("button", { name: "恢复请求", exact: true }).click();
  await tracking.getByRole("button", { name: "重试", exact: true }).click();
  await tracking.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  const raceStart = await page.evaluate(() => __analyticsTest.requests.length);
  await page.evaluate(() => {
    __analyticsTest.controls.delay = 700;
  });
  await tracking.getByRole("button", { name: "近 7 天", exact: true }).click();
  await page.waitForFunction((count) => __analyticsTest.requests.length > count, raceStart);
  await page.evaluate(() => {
    __analyticsTest.controls.delay = 120;
  });
  await tracking.getByRole("button", { name: "近 30 天", exact: true }).click();
  await tracking.getByText(/收到 119 条日记录/).waitFor();
  await page.waitForTimeout(750);
  assert.equal(
    await tracking.getByText(/收到 119 条日记录/).count(),
    1,
    "late 7-day responses cannot replace 30-day results",
  );
  await page.screenshot({ path: `${output}/tracking.png`, fullPage: true });

  await page.getByRole("tab", { name: "数据汇总", exact: true }).click();
  const summary = page.getByRole("tabpanel", { name: "数据汇总", exact: true });
  await summary.getByRole("searchbox", { name: "搜索月度资源", exact: true }).waitFor();
  await page.evaluate(() => {
    __analyticsTest.controls.delay = 600;
  });
  await summary.getByRole("button", { name: "近 3 个月", exact: true }).click();
  await summary.getByText(/暂显示/).waitFor();
  assert.equal(
    await summary.getByRole("combobox", { name: "月份", exact: true }).locator("option").count(),
    1,
    "old monthly data keeps its original scope",
  );
  await summary.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  assert.equal(await summary.getByRole("combobox", { name: "月份", exact: true }).locator("option").count(), 3);
  assert.equal(await summary.getByRole("group", { name: "图表系列，点击切换显示" }).getByRole("button").count(), 1);
  await summary.getByRole("button", { name: "第 2 页", exact: true }).click();
  await summary.getByRole("searchbox", { name: "搜索月度资源", exact: true }).fill("资源 18");
  await summary.getByText("共 1 个 · 搜索不影响合计", { exact: true }).waitFor();
  await summary.getByRole("button", { name: "资源 Top 10", exact: true }).click();
  assert.equal(await summary.getByRole("group", { name: "图表系列，点击切换显示" }).getByRole("button").count(), 10);
  await summary.getByRole("searchbox", { name: "搜索月度资源", exact: true }).fill("");
  await page.screenshot({ path: `${output}/summary.png`, fullPage: true });

  // A missing month leaves the other totals, chart points and month selection usable
  await page.evaluate(() => {
    __analyticsTest.controls.unavailableMonths = ["2026-10"];
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await summary.getByText(/2026-10：平台暂未提供月汇总数据。合计仅包含已有数据/).waitFor();
  assert.equal(await summary.getByText(/数据加载失败/).count(), 0);
  assert.equal(await summary.getByRole("slider").count(), 1);
  assert.equal(await summary.getByText("44,424", { exact: true }).count(), 1);
  const summaryMonth = summary.getByRole("combobox", { name: "月份", exact: true });
  assert.match(await summaryMonth.locator('option[value="2026-10"]').innerText(), /暂未提供/);
  await summary.getByText("2026-10：平台暂未提供月汇总数据", { exact: true }).waitFor();
  assert.equal(await summary.getByRole("searchbox", { name: "搜索月度资源", exact: true }).count(), 0);
  await summaryMonth.selectOption("2026-09");
  await summary.getByRole("searchbox", { name: "搜索月度资源", exact: true }).waitFor();
  await summary.getByText("1,234", { exact: true }).first().waitFor();
  await summary.getByRole("combobox", { name: "查看数值", exact: true }).selectOption("2026-10");
  await page.screenshot({ path: `${output}/summary-missing-month.png`, fullPage: true });
  await page.evaluate(() => {
    __analyticsTest.controls.unavailableMonths = ["2026-08", "2026-09", "2026-10"];
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await summary.getByText("当前日期范围的月汇总数据暂未提供", { exact: true }).waitFor();
  assert.equal(await summary.getByText(/数据加载失败/).count(), 0);
  assert.equal(await summary.getByRole("slider").count(), 0);
  assert.equal(await summary.getByText("—", { exact: true }).count(), 3);
  await page.screenshot({ path: `${output}/summary-all-missing.png`, fullPage: true });
  await page.evaluate(() => {
    __analyticsTest.controls.unavailableMonths = [];
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await summary.getByRole("slider").waitFor();
  assert.equal(await summary.getByText(/合计仅包含已有数据，缺失月份不计为零/).count(), 0);

  // Month grids stage single months and cross-year ranges, with no query before Apply
  const monthEntry = summary.getByRole("button", { name: "自选月份", exact: true });
  const monthPicker = summary.getByRole("dialog", { name: "选择统计月份", exact: true });
  const monthYear = monthPicker.getByRole("combobox", { name: "选择年份", exact: true });
  const beforeMonthDraft = await page.evaluate(() => __analyticsTest.requests.length);
  await monthEntry.click();
  assert.equal(await monthEntry.getAttribute("aria-pressed"), "false");
  assert.equal(await monthPicker.getByRole("button", { name: "2026年11月", exact: true }).isDisabled(), true);
  await monthYear.selectOption("2024");
  await monthPicker.getByRole("button", { name: "2024年2月", exact: true }).click();
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), beforeMonthDraft);
  await monthPicker.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await monthPicker.count(), 0);
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), beforeMonthDraft);
  await monthEntry.click();
  await monthYear.selectOption("2024");
  await monthPicker.getByRole("button", { name: "2024年2月", exact: true }).click();
  await monthPicker.getByRole("button", { name: "应用", exact: true }).click();
  await summaryMonth.locator('option[value="2024-02"]').waitFor({ state: "attached" });
  assert.equal(await summaryMonth.inputValue(), "2024-02");
  const historicalRequest = await page.evaluate(
    () => __analyticsTest.requests.filter((request) => request.method === "analytics.monthly").at(-1).params,
  );
  assert.equal(historicalRequest.startDate, "2024-02-01");
  assert.equal(historicalRequest.endDate, "2024-02-29");
  await page.getByRole("button", { name: "离开分析页", exact: true }).click();
  await page.getByRole("button", { name: "返回分析页", exact: true }).click();
  await monthEntry.waitFor();
  assert.equal(await monthEntry.getAttribute("aria-pressed"), "true");
  await monthEntry.click();
  assert.equal(await monthYear.inputValue(), "2024");
  await monthPicker.getByText("尚未选择", { exact: true }).waitFor();
  assert.equal(await monthPicker.getByRole("button", { name: "应用", exact: true }).isDisabled(), true);
  assert.equal(
    await monthPicker.getByRole("button", { name: "2024年2月", exact: true }).getAttribute("aria-pressed"),
    "false",
  );
  await monthPicker.getByRole("button", { name: "连续月份", exact: true }).click();
  await monthPicker.getByRole("button", { name: "2024年1月", exact: true }).click();
  assert.equal(await monthPicker.getByRole("button", { name: "应用", exact: true }).isDisabled(), true);
  await monthYear.selectOption("2025");
  await monthPicker.getByRole("button", { name: "2025年2月", exact: true }).click();
  await monthPicker.getByText("一次最多选择 12 个月（含起止月份）", { exact: true }).waitFor();
  assert.equal(await monthPicker.getByRole("button", { name: "应用", exact: true }).isDisabled(), true);
  await monthPicker.getByRole("button", { name: "2025年12月", exact: true }).click();
  await monthYear.selectOption("2026");
  await monthPicker.getByRole("button", { name: "2026年2月", exact: true }).click();
  await monthPicker.getByText("已选 3 个月 · 含起止月份", { exact: true }).waitFor();
  const beforeRangeApply = await page.evaluate(() => __analyticsTest.requests.length);
  await page.setViewportSize({ width: 900, height: 1000 });
  for (const theme of ["dark", "light", "fluent"]) {
    await page.evaluate((name) => __analyticsTest.theme(name), theme);
    await page.screenshot({ path: `${output}/summary-month-picker-${theme}.png` });
  }
  await page.evaluate(() => __analyticsTest.theme("dark"));
  const monthBounds = await monthPicker.boundingBox();
  assert.ok(monthBounds.x >= 0 && monthBounds.x + monthBounds.width <= 900);
  for (const zoom of [1.25, 1.5]) {
    await page.evaluate((value) => {
      document.documentElement.style.zoom = String(value);
    }, zoom);
    await page.waitForTimeout(80);
    const bounds = await monthPicker.boundingBox();
    assert.ok(
      bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 900 && bounds.y + bounds.height <= 1000,
      `month picker fits at ${zoom * 100}%`,
    );
  }
  await page.screenshot({ path: `${output}/summary-month-picker-150.png` });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), beforeRangeApply);
  await monthPicker.getByRole("button", { name: "应用", exact: true }).click();
  await summaryMonth.locator('option[value="2026-02"]').waitFor({ state: "attached" });
  assert.equal(await summaryMonth.locator("option").count(), 3);
  const rangeRequest = await page.evaluate(
    () => __analyticsTest.requests.filter((r) => r.method === "analytics.monthly").at(-1).params,
  );
  assert.equal(rangeRequest.startDate, "2025-12-01");
  assert.equal(rangeRequest.endDate, "2026-02-28");
  await monthEntry.click();
  assert.equal(await monthPicker.locator('[data-month][aria-pressed="true"]').count(), 0);
  assert.equal(await monthPicker.getByRole("button", { name: "应用", exact: true }).isDisabled(), true);
  await monthPicker.getByRole("button", { name: "2026年2月", exact: true }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await monthYear.inputValue(), "2025");
  assert.equal(
    await monthPicker
      .getByRole("button", { name: "2025年12月", exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await monthPicker.count(), 0);
  assert.equal(await monthEntry.evaluate((element) => element === document.activeElement), true);
  await monthEntry.click();
  await summary.getByText("时间", { exact: true }).click();
  assert.equal(await monthPicker.count(), 0);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await summary.getByRole("button", { name: "近 3 个月", exact: true }).click();
  await summaryMonth.locator('option[value="2026-10"]').waitFor({ state: "attached" });
  assert.equal(await monthEntry.getAttribute("aria-pressed"), "false");

  await page.getByRole("tab", { name: "模组分析", exact: true }).click();
  const module = page.getByRole("tabpanel", { name: "模组分析", exact: true });
  await module.getByRole("table").waitFor();
  await module.getByRole("button", { name: /^模组 测试资源/ }).click();
  const input = module.getByRole("combobox", { name: "搜索模组", exact: true });
  await input.fill("资源 18");
  await input.press("Enter");
  await module.getByText(/暂显示/).waitFor();
  assert.doesNotMatch(
    await module.getByRole("table").innerText(),
    /测试资源 18/,
    "new selector cannot relabel an old resource's values",
  );
  await module.getByRole("columnheader", { name: /测试资源 18/ }).waitFor();
  assert.match(await module.getByRole("table").innerText(), /测试资源 18/);
  await module.getByRole("button", { name: /^模组 测试资源/ }).click();
  await input.press("Escape");
  assert.equal(await module.getByRole("dialog").count(), 0);
  await module.getByRole("button", { name: "近 7 天", exact: true }).click();
  await module.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  // Custom dates remain a draft until confirmed and use the existing daily query
  const custom = module.getByRole("button", { name: "自定义", exact: true });
  const calendar = module.getByRole("dialog", { name: "自定义日期范围", exact: true });
  const customCalls = await page.evaluate(() => __analyticsTest.requests.length);
  await custom.click();
  assert.equal(await calendar.getByLabel("开始日期", { exact: true }).inputValue(), "");
  assert.equal(await calendar.getByLabel("结束日期", { exact: true }).inputValue(), "");
  assert.equal(await calendar.getByRole("button", { pressed: true }).count(), 0);
  assert.equal(await calendar.getByRole("button", { name: "应用", exact: true }).isEnabled(), false);
  await calendar.getByRole("button", { name: "2026-10-02", exact: true }).click();
  assert.equal(await calendar.getByRole("button", { name: "应用", exact: true }).isEnabled(), false);
  await calendar.getByRole("button", { name: "2026-10-05", exact: true }).click();
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), customCalls);
  await calendar.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await calendar.count(), 0);
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), customCalls);
  await custom.click();
  assert.equal(await calendar.getByLabel("开始日期", { exact: true }).inputValue(), "");
  assert.equal(await calendar.getByLabel("结束日期", { exact: true }).inputValue(), "");
  assert.equal(await calendar.getByRole("button", { name: "2026-10-16", exact: true }).isEnabled(), false);
  await calendar.getByRole("button", { name: "2026-10-02", exact: true }).click();
  await calendar.getByRole("button", { name: "2026-10-05", exact: true }).click();
  await calendar.getByRole("button", { name: "应用", exact: true }).click();
  await module.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  const customParams = await page.evaluate(() => __analyticsTest.requests.at(-1).params);
  assert.equal(customParams.startDate, "2026-10-02");
  assert.equal(customParams.endDate, "2026-10-05");
  assert.equal(await module.getByRole("combobox", { name: "查看数值", exact: true }).locator("option").count(), 4);
  assert.equal(await custom.getAttribute("aria-pressed"), "true");
  assert.equal(
    await module.getByRole("button", { name: "近 7 天", exact: true }).getAttribute("aria-pressed"),
    "false",
  );
  await page.reload();
  await module.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  assert.equal(await custom.getAttribute("aria-pressed"), "true");
  await custom.click();
  assert.equal(await calendar.getByLabel("开始日期", { exact: true }).inputValue(), "");
  assert.equal(await calendar.getByLabel("结束日期", { exact: true }).inputValue(), "");
  assert.equal(await calendar.getByRole("button", { pressed: true }).count(), 0);
  await calendar.getByLabel("结束日期", { exact: true }).fill("2026-10-05");
  await calendar.getByLabel("开始日期", { exact: true }).fill("2026-10-10");
  await calendar.getByText("开始日期不能晚于结束日期", { exact: true }).waitFor();
  await calendar.getByLabel("开始日期", { exact: true }).fill("2024-01-01");
  await calendar.getByText("一次最多选择 366 天（含起止日期）", { exact: true }).waitFor();
  await calendar.getByLabel("结束日期", { exact: true }).fill("2026-10-16");
  await calendar.getByText("只能选择昨天及以前的完整日数据", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await calendar.count(), 0);
  assert.equal(await custom.evaluate((element) => element === document.activeElement), true);
  await module.getByRole("button", { name: "近 7 天", exact: true }).click();
  await module.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  assert.equal(await custom.getAttribute("aria-pressed"), "false");
  await custom.click();
  await calendar.getByRole("button", { name: "2026-10-01", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-date") === "2026-09-30");
  await page.keyboard.press("Enter");
  await calendar.getByRole("button", { name: "下个月", exact: true }).click();
  await calendar.getByRole("button", { name: "2026-10-02", exact: true }).click();
  assert.equal(await calendar.getByLabel("开始日期", { exact: true }).inputValue(), "2026-09-30");
  assert.equal(await calendar.getByLabel("结束日期", { exact: true }).inputValue(), "2026-10-02");
  await module.getByText("时间", { exact: true }).click();
  assert.equal(await calendar.count(), 0, "clicking outside discards the cross-month draft");
  await page.screenshot({ path: `${output}/module.png`, fullPage: true });

  await page.getByRole("tab", { name: "周期收益", exact: true }).click();
  const period = page.getByRole("tabpanel", { name: "周期收益", exact: true });
  await period.getByRole("region", { name: "周期收益趋势", exact: true }).waitFor();
  await period.getByText("PE · 每月 22 日至下月 21 日（含起止当天）", { exact: true }).waitFor();
  assert.match(await period.innerText(), /相邻周期不重叠/);
  assert.doesNotMatch(await period.innerText(), /重叠一天|不可直接跨周期累加/);
  await period.getByRole("button", { name: "上一周期", exact: true }).click();
  await period.getByText(/暂显示/).waitFor();
  await period.getByText("PE · 2026-08-22 — 2026-09-21", { exact: true }).waitFor();
  await period.getByText("已更新 · 筛选自动生效", { exact: true }).last().waitFor();
  const previousParams = await page.evaluate(
    () => __analyticsTest.requests.filter((r) => r.method === "analytics.periodIncome").at(-1).params,
  );
  assert.equal(previousParams.startDate, "2026-08-22");
  assert.equal(previousParams.endDate, "2026-09-21");
  assert.equal(previousParams.settlementMonth, "2026-09");
  const cycle = await period.getByRole("combobox", { name: "收益周期", exact: true }).inputValue();
  const peCalls = await page.evaluate(() => __analyticsTest.requests.length);
  await period.getByRole("button", { name: /^统计资源 全部/ }).click();
  await period.getByRole("combobox", { name: "搜索统计资源", exact: true }).fill("资源 18");
  await period.getByRole("combobox", { name: "搜索统计资源", exact: true }).press("Enter");
  assert.equal(
    await page.evaluate(() => __analyticsTest.requests.length),
    peCalls,
    "PE resource filter uses the account snapshot",
  );
  await period.getByRole("button", { name: "PC · 电脑版", exact: true }).click();
  await period.getByRole("region", { name: "周期收益趋势", exact: true }).waitFor();
  await period.getByText("PC · 每月 22 日至下月 21 日（含起止当天）", { exact: true }).waitFor();
  assert.match(await period.innerText(), /PC 独立资源/);
  assert.doesNotMatch(await period.innerText(), /测试资源 18/);
  await period.getByRole("button", { name: "PE · 手游", exact: true }).click();
  assert.equal(await period.getByRole("combobox", { name: "收益周期", exact: true }).inputValue(), cycle);
  assert.equal(await period.getByRole("button", { name: /^统计资源 测试资源 18/ }).count(), 1);
  assert.equal(await period.getByRole("region", { name: "周期收益趋势", exact: true }).count(), 1);
  await page.screenshot({ path: `${output}/period.png`, fullPage: true });

  await page.getByRole("tab", { name: "实时收益", exact: true }).click();
  const realtime = page.getByRole("tabpanel", { name: "实时收益", exact: true });
  await realtime.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  await realtime.getByRole("button", { name: "昨天", exact: true }).click();
  await realtime.getByText(/暂显示.*实时收益/).waitFor();
  assert.equal(await realtime.getByRole("table").count(), 2, "changing dates does not remove realtime tables");
  await realtime.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  await realtime.getByRole("button", { name: "今天", exact: true }).click();
  assert.equal(
    await realtime.getByRole("table").count(),
    2,
    "returning to today's exact scope immediately reuses its snapshot",
  );
  await realtime.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  await page.getByRole("button", { name: "离开分析页", exact: true }).click();
  await page.getByRole("button", { name: "返回分析页", exact: true }).click();
  assert.equal(await page.getByRole("tab", { name: "实时收益", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(
    await realtime.getByRole("table").count(),
    2,
    "reentering analytics immediately restores the realtime snapshot",
  );
  await realtime.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "数据汇总", exact: true }).click();
  assert.equal(
    await summary.getByRole("button", { name: "近 3 个月", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await summary.getByRole("button", { name: "资源 Top 10", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("tab", { name: "模组分析", exact: true }).click();
  assert.equal(await module.getByRole("button", { name: /^模组 测试资源 18/ }).count(), 1);
  assert.equal(await module.getByRole("button", { name: "近 7 天", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("tab", { name: "周期收益", exact: true }).click();
  await period.getByRole("combobox", { name: "收益周期", exact: true }).waitFor();
  assert.equal(await period.getByRole("combobox", { name: "收益周期", exact: true }).inputValue(), cycle);
  assert.equal(await period.getByRole("button", { name: /^统计资源 测试资源 18/ }).count(), 1);

  await page.getByRole("tab", { name: "数据汇总", exact: true }).click();
  await page.reload();
  await summary.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  assert.equal(await page.getByRole("tab", { name: "数据汇总", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(
    await page.evaluate(() => __analyticsTest.requests.some((entry) => entry.method === "works.list")),
    false,
    "monthly-only entry skips the unrelated resource list",
  );

  for (const theme of ["dark", "light", "fluent"]) {
    await page.evaluate((value) => __analyticsTest.theme(value), theme);
    await page.setViewportSize({ width: 900, height: 1000 });
    for (const name of ["数据追踪", "数据汇总", "模组分析", "周期收益", "实时收益"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      const active = page.getByRole("tabpanel", { name, exact: true });
      if (name === "实时收益") await active.getByRole("table").first().waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `${name}/${theme} has no page overflow`,
      );
      await page.screenshot({ path: `${output}/${theme}-${name}.png`, fullPage: true });
      if (name === "模组分析") {
        await custom.click();
        const bounds = await calendar.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 900, `${theme} calendar stays inside the viewport`);
        await page.screenshot({ path: `${output}/${theme}-module-calendar.png`, fullPage: true });
        await page.setViewportSize({ width: 720, height: 600 });
        // The popup follows resize events, so measure after the browser has completed the resize frame
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        const smallBounds = await calendar.boundingBox();
        assert.ok(smallBounds.x >= 0 && smallBounds.x + smallBounds.width <= 720, `${theme} narrow calendar fits`);
        assert.ok(
          smallBounds.y >= 0 && smallBounds.y + smallBounds.height <= 600,
          `${theme} short calendar fits: ${JSON.stringify(smallBounds)}`,
        );
        assert.equal(
          await calendar.evaluate((element) => {
            const input = element.querySelector("input");
            const bounds = input.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
            );
          }),
          true,
          `${theme} calendar fields stay above the sticky tab bar`,
        );
        await page.screenshot({ path: `${output}/${theme}-module-calendar-narrow.png`, fullPage: true });
        await calendar.getByRole("button", { name: "取消", exact: true }).click();
        await page.setViewportSize({ width: 900, height: 1000 });
      }
    }
  }
  // A failed new scope keeps the old chart explicitly labelled and its controls remain usable
  await page.getByRole("tab", { name: "模组分析", exact: true }).click();
  await module.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  await page.getByRole("button", { name: "模拟请求失败", exact: true }).click();
  const previousDates = await module
    .getByRole("combobox", { name: "查看数值", exact: true })
    .locator("option")
    .allTextContents();
  await module.getByRole("button", { name: "近 30 天", exact: true }).click();
  await module.getByText(/数据加载失败.*已保留/).waitFor();
  assert.deepEqual(
    await module.getByRole("combobox", { name: "查看数值", exact: true }).locator("option").allTextContents(),
    previousDates,
  );
  assert.equal(await module.getByRole("button", { name: "钻石收益", exact: true }).count(), 1);
  await page.getByRole("button", { name: "恢复请求", exact: true }).click();
  await module.getByRole("button", { name: "重试", exact: true }).click();
  await module.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  assert.equal(await module.getByRole("combobox", { name: "查看数值", exact: true }).locator("option").count(), 30);
  await page.getByRole("tab", { name: "数据追踪", exact: true }).click();
  await page.evaluate(() => {
    __analyticsTest.controls.delay = 900;
    __analyticsTest.clearCache();
  });
  assert.equal(await tracking.getByRole("table").count(), 0, "explicit cache clearing discards visible snapshots");
  await tracking.getByRole("table").waitFor();
  // Restore explicit selections and presentation choices after navigation and a fresh document
  await tracking.getByRole("button", { name: "近 7 天", exact: true }).click();
  await tracking.getByText(/共 4 个资源 · 7 天/).waitFor();
  await tracking.getByRole("button", { name: "钻石收益", exact: true }).click();
  await tracking.getByRole("button", { name: "柱状", exact: true }).click();
  const selection = await tracking.getByRole("group", { name: "已选对比资源" }).innerText();
  await page.getByRole("button", { name: "离开分析页", exact: true }).click();
  await page.getByRole("button", { name: "返回分析页", exact: true }).click();
  await tracking.getByRole("table").waitFor();
  assert.equal(await tracking.getByRole("group", { name: "已选对比资源" }).innerText(), selection);
  await page.reload();
  await tracking.getByRole("table").waitFor();
  assert.equal(await tracking.getByRole("group", { name: "已选对比资源" }).innerText(), selection);
  for (const name of ["近 7 天", "钻石收益", "柱状"]) {
    assert.equal(await tracking.getByRole("button", { name, exact: true }).getAttribute("aria-pressed"), "true");
  }
  const restoredRequest = await page.evaluate(() =>
    __analyticsTest.requests.find((r) => r.method === "analytics.daily"),
  );
  assert.deepEqual(restoredRequest.params.resourceIds, ["1", "2", "3", "18"], "first request uses saved resources");
  await tracking.getByRole("button", { name: "清空", exact: true }).click();
  await page.reload();
  await tracking.getByText("尚未选择资源，点击“选择资源”添加对比作品", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => __analyticsTest.requests.some((r) => r.method === "analytics.daily")), false);
  await tracking.getByRole("button", { name: "Top 10", exact: true }).click();
  await tracking.getByText(/按钻石收益区间合计降序展示 10/).waitFor();
  await tracking.getByRole("button", { name: "折线", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => __analyticsTest.theme("dark"));
  const comparison = tracking.getByRole("region", { name: "资源数据趋势", exact: true });
  const readout = comparison.getByRole("group", { name: "图表系列，点击切换显示" });
  const tooltip = comparison.getByRole("tooltip");
  assert.equal(await tooltip.count(), 0, "floating values stay closed until a date is inspected");
  assert.equal(await readout.getByRole("button").count(), 10);
  assert.equal(await readout.evaluate((element) => element.scrollHeight <= element.clientHeight), true);
  const colors = await comparison
    .locator("[data-series-id] path")
    .evaluateAll((paths) => paths.map((path) => getComputedStyle(path).stroke));
  assert.equal(new Set(colors).size, 10, "all ten plotted resources have distinct colors");
  await readout.getByRole("button").first().hover();
  assert.equal(
    await comparison.locator('[data-series-id][opacity="0.18"]').count(),
    9,
    "resource hover highlights its curve",
  );
  await readout.getByRole("button").first().click();
  assert.equal(await comparison.locator("[data-series-id]").count(), 9);
  await comparison.getByRole("button", { name: "显示全部", exact: true }).click();
  assert.equal(await comparison.locator("[data-series-id]").count(), 10);
  const lastDate = await datePicker.inputValue();
  await comparison.getByRole("button", { name: "上一个日期", exact: true }).click();
  assert.notEqual(await datePicker.inputValue(), lastDate);
  await comparison.getByRole("button", { name: "下一个日期", exact: true }).click();
  assert.equal(await datePicker.inputValue(), lastDate);
  assert.equal(await comparison.getByRole("button", { name: "下一个日期", exact: true }).isDisabled(), true);
  const plotBox = await chart.boundingBox();
  await page.mouse.move(plotBox.x + 66, plotBox.y + 80);
  const firstDate = await datePicker.locator("option").first().getAttribute("value");
  assert.equal(await datePicker.inputValue(), firstDate, "hover previews the nearest date");
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), new RegExp(firstDate));
  assert.equal(await tooltip.locator('[class*="tooltipRow"]').count(), 10);
  assert.equal(await readout.locator("strong").count(), 0, "compact legend contains no permanent value cards");
  await comparison.screenshot({ path: `${output}/tracking-floating-values.png` });
  const floatingBox = await tooltip.boundingBox();
  await page.mouse.move(floatingBox.x + floatingBox.width / 2, plotBox.y + 80);
  assert.notEqual(await datePicker.inputValue(), firstDate, "floating values do not block pointer inspection");
  await page.mouse.click(plotBox.x + 66, plotBox.y + 80);
  await comparison.getByRole("button", { name: "显示全部", exact: true }).hover();
  assert.equal(await datePicker.inputValue(), firstDate, "click pins the date after the pointer leaves");
  assert.equal(await tooltip.isVisible(), true, "pinned values remain visible outside the plot");
  await chart.focus();
  await page.keyboard.press("Escape");
  assert.equal(await datePicker.inputValue(), lastDate);
  assert.equal(await tooltip.count(), 0, "Escape dismisses the pinned tooltip");
  await page.mouse.move(plotBox.x + plotBox.width - 22, plotBox.y + 80);
  const tooltipBox = await tooltip.boundingBox();
  assert.ok(tooltipBox.x >= plotBox.x && tooltipBox.x + tooltipBox.width <= plotBox.x + plotBox.width);
  await comparison.getByRole("button", { name: "显示全部", exact: true }).hover();
  assert.equal(await tooltip.count(), 0, "unpinned values disappear when the pointer leaves");
  await comparison.screenshot({ path: `${output}/tracking-comparison.png` });
  await page.setViewportSize({ width: 760, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await readout.evaluate((element) => element.scrollHeight <= element.clientHeight), true);
  await chart.focus();
  await page.keyboard.press("Home");
  const narrowPlot = await chart.boundingBox();
  const narrowTooltip = await tooltip.boundingBox();
  assert.ok(
    narrowTooltip.x >= narrowPlot.x && narrowTooltip.x + narrowTooltip.width <= narrowPlot.x + narrowPlot.width,
  );
  assert.ok(
    narrowTooltip.y >= narrowPlot.y && narrowTooltip.y + narrowTooltip.height <= narrowPlot.y + narrowPlot.height,
  );
  await comparison.screenshot({ path: `${output}/tracking-comparison-narrow.png` });
  await page.reload();
  await tracking.getByText(/按钻石收益区间合计降序展示 10/).waitFor();
  await tracking.getByRole("button", { name: "近 30 天", exact: true }).click();
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText(/当前账号暂无可分析的手游资源/).waitFor();
  assert.equal(await page.getByRole("table").count(), 0, "late requests cannot expose another account's results");
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await tracking.getByText(/按钻石收益区间合计降序展示 10/).waitFor();
  assert.equal(
    await tracking.getByRole("button", { name: "近 30 天", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  // Ignore foreign-account preferences and unavailable resource IDs without selecting default resources
  await page.evaluate(() => {
    localStorage.setItem("glaze:analytics:tracking:v1:analytics-b", JSON.stringify({ resourceIds: ["17"] }));
    localStorage.setItem("glaze:analytics:tracking:v1:analytics-a", JSON.stringify({ resourceIds: ["18", "missing"] }));
  });
  await page.reload();
  await tracking.getByRole("table").waitFor();
  assert.equal(await tracking.getByRole("group", { name: "已选对比资源" }).getByRole("button").count(), 1);
  assert.deepEqual(
    await page.evaluate(() => __analyticsTest.requests.find((r) => r.method === "analytics.daily").params.resourceIds),
    ["18"],
  );
  for (const invalid of [
    "{broken",
    JSON.stringify({ resourceIds: 42, days: 999, metric: "invalid", chartKind: "invalid" }),
  ]) {
    await page.evaluate((value) => localStorage.setItem("glaze:analytics:tracking:v1:analytics-a", value), invalid);
    await page.reload();
    await tracking.getByRole("table").waitFor();
    assert.equal(await tracking.getByRole("group", { name: "已选对比资源" }).getByRole("button").count(), 3);
    for (const name of ["近 14 天", "新增购买", "折线"]) {
      assert.equal(await tracking.getByRole("button", { name, exact: true }).getAttribute("aria-pressed"), "true");
    }
  }
  // Follower counts need extended statistics; other metrics reuse the ordinary daily response
  const metricCalls = await page.evaluate(() => __analyticsTest.requests.length);
  for (const name of ["新增购买", "销售总量", "钻石收益", "绿宝石收益", "日活", "退款率", "人均游玩时长", "组件涨粉"]) {
    await tracking.getByRole("button", { name, exact: true }).click();
    await tracking.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
    if (["日活", "退款率", "人均游玩时长"].includes(name)) {
      assert.equal(await tracking.getByRole("columnheader", { name: "已返回数据合计", exact: true }).count(), 0);
      assert.equal(await tracking.getByRole("columnheader", { name: "有数据日均", exact: true }).count(), 1);
    }
    if (name === "退款率") {
      await tracking.getByRole("slider").focus();
      await page.keyboard.press("Home");
      assert.match(await tracking.getByRole("tooltip").innerText(), /0\.3%/);
      await tracking
        .getByRole("region", { name: "资源数据趋势", exact: true })
        .screenshot({ path: `${output}/tracking-refund-rate.png` });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), metricCalls + 1);
  assert.equal(await page.evaluate(() => __analyticsTest.requests.at(-1).params.includePeers), true);
  await tracking.getByRole("button", { name: "退款率", exact: true }).click();
  await page.reload();
  await tracking.getByRole("table").waitFor();
  assert.equal(
    await tracking.getByRole("button", { name: "退款率", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  // The 22nd starts an empty cycle; the 23rd queries only the completed 22nd on either platform
  for (const day of [22, 23]) {
    const boundaryPage = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    boundaryPage.on("pageerror", (error) => errors.push(error.message));
    await boundaryPage.clock.setFixedTime(new Date(`2026-10-${day}T12:00:00+08:00`));
    await boundaryPage.goto(`${server.resolvedUrls.local[0]}tests/fixtures/analytics.html?dense&period`);
    await boundaryPage.getByRole("tab", { name: "周期收益", exact: true }).click();
    const boundaryPeriod = boundaryPage.getByRole("tabpanel", { name: "周期收益", exact: true });
    for (const platform of ["pe", "pc"]) {
      if (platform === "pc") await boundaryPeriod.getByRole("button", { name: "PC · 电脑版", exact: true }).click();
      if (day === 22) {
        await boundaryPeriod
          .getByText("本周期刚开始，完整日数据从明天起统计。可以选择上一周期查看收益。", { exact: true })
          .waitFor();
        assert.equal(
          await boundaryPage.evaluate(
            (value) =>
              __analyticsTest.requests.filter(
                (r) => r.method === "analytics.periodIncome" && r.params.platform === value,
              ).length,
            platform,
          ),
          0,
        );
        await boundaryPeriod.getByRole("button", { name: "上一周期", exact: true }).click();
      }
      await boundaryPeriod.getByRole("region", { name: "周期收益趋势", exact: true }).waitFor();
      const params = await boundaryPage.evaluate(
        (value) =>
          __analyticsTest.requests
            .filter((r) => r.method === "analytics.periodIncome" && r.params.platform === value)
            .at(-1).params,
        platform,
      );
      assert.equal(params.startDate, day === 22 ? "2026-09-22" : "2026-10-22");
      assert.equal(params.endDate, day === 22 ? "2026-10-21" : "2026-10-22");
      assert.equal(params.settlementMonth, day === 22 ? "2026-10" : "2026-11");
    }
    await boundaryPage.close();
  }
  // Work cards select their own module even when another tab/resource was saved previously
  const workPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  workPage.on("pageerror", (error) => errors.push(error.message));
  await workPage.addInitScript(() => {
    localStorage.setItem("glaze:analytics:view:v1:analytics-a:tab", JSON.stringify("summary"));
    localStorage.setItem("glaze:analytics:view:v1:analytics-a:module.resource", JSON.stringify("1"));
  });
  await workPage.goto(`${server.resolvedUrls.local[0]}tests/fixtures/analytics.html?works&shell`);
  const dataLink = workPage.getByRole("button", { name: "查看 分析资源乙 数据", exact: true });
  const detailLink = workPage.getByRole("button", { name: "查看 分析资源乙 详情", exact: true });
  await dataLink.waitFor();
  const dataBounds = await dataLink.boundingBox();
  const detailBounds = await detailLink.boundingBox();
  assert.ok(dataBounds.x + dataBounds.width <= detailBounds.x, "data action appears left of details");
  await workPage.screenshot({ path: `${output}/work-data-entry.png` });
  await dataLink.click();
  const modulePanel = workPage.getByRole("tabpanel", { name: "模组分析", exact: true });
  await modulePanel.getByRole("button", { name: "模组 分析资源乙", exact: true }).waitFor();
  await modulePanel.getByRole("table").waitFor();
  assert.equal(
    await workPage.getByRole("tab", { name: "模组分析", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  const moduleRequests = await workPage.evaluate(() =>
    __analyticsTest.requests.filter((request) => request.method === "analytics.daily"),
  );
  assert.ok(moduleRequests.length > 0);
  assert.ok(
    moduleRequests.every(
      (request) => request.params.account === "analytics-a" && JSON.stringify(request.params.resourceIds) === '["2"]',
    ),
  );
  await modulePanel.getByRole("button", { name: "模组 分析资源乙", exact: true }).click();
  await modulePanel.getByRole("option", { name: "分析资源甲", exact: true }).click();
  await modulePanel.getByRole("button", { name: "模组 分析资源甲", exact: true }).waitFor();
  await workPage.getByRole("tab", { name: "数据追踪", exact: true }).click();
  await workPage.getByRole("tab", { name: "模组分析", exact: true }).click();
  await modulePanel.getByRole("button", { name: "模组 分析资源甲", exact: true }).waitFor();
  await workPage.getByRole("button", { name: "返回作品列表", exact: true }).click();
  await dataLink.click();
  await modulePanel.getByRole("button", { name: "模组 分析资源乙", exact: true }).waitFor();
  await workPage.getByRole("button", { name: "返回作品列表", exact: true }).click();
  const beforeUnavailable = await workPage.evaluate(
    () => __analyticsTest.requests.filter((request) => request.method === "analytics.daily").length,
  );
  await workPage.getByRole("button", { name: "查看 未上架资源 数据", exact: true }).click();
  await modulePanel.getByText(/所选作品暂无可分析的数据/).waitFor();
  assert.equal(await modulePanel.getByRole("table").count(), 0);
  assert.equal(
    await workPage.evaluate(
      () => __analyticsTest.requests.filter((request) => request.method === "analytics.daily").length,
    ),
    beforeUnavailable,
  );
  await modulePanel.getByRole("button", { name: "模组 请选择资源", exact: true }).click();
  await modulePanel.getByRole("option", { name: "分析资源甲", exact: true }).click();
  await modulePanel.getByRole("table").waitFor();
  await workPage.getByRole("button", { name: "切换测试账号", exact: true }).click();
  assert.equal(
    await workPage.getByRole("tab", { name: "数据追踪", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  await workPage.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: automatic filters, request coalescing, cache reuse, refresh recovery, preserved chart state, searchable resources, monthly paging, PE/PC isolation, cache clearing, account isolation, persistent comparison preferences and five tabs in three themes",
  );
} finally {
  await browser?.close();
  await server.close();
}
