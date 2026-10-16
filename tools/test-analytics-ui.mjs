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
  await tracking.getByRole("table").waitFor();
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), before + 1);
  await tracking.getByRole("button", { name: "近 14 天", exact: true }).click();
  assert.equal(await tracking.getByRole("table").count(), 1);
  assert.equal(await page.evaluate(() => __analyticsTest.requests.length), before + 1);
  await tracking.getByRole("button", { name: "选择资源", exact: true }).click();
  await tracking.getByRole("searchbox", { name: "搜索对比资源", exact: true }).fill("资源 18");
  await tracking.getByRole("checkbox").check();
  await tracking.getByRole("table").waitFor();
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
  assert.equal(await summary.getByRole("group", { name: "图表系列，点击切换显示" }).getByRole("button").count(), 1);
  await summary.getByRole("button", { name: "第 2 页", exact: true }).click();
  await summary.getByRole("searchbox", { name: "搜索月度资源", exact: true }).fill("资源 18");
  await summary.getByText("共 1 个 · 搜索不影响合计", { exact: true }).waitFor();
  await summary.getByRole("button", { name: "资源 Top 10", exact: true }).click();
  assert.equal(await summary.getByRole("group", { name: "图表系列，点击切换显示" }).getByRole("button").count(), 10);
  await summary.getByRole("searchbox", { name: "搜索月度资源", exact: true }).fill("");
  await page.screenshot({ path: `${output}/summary.png`, fullPage: true });

  await page.getByRole("tab", { name: "模组分析", exact: true }).click();
  const module = page.getByRole("tabpanel", { name: "模组分析", exact: true });
  await module.getByRole("table").waitFor();
  await module.getByRole("button", { name: /^模组 测试资源/ }).click();
  const input = module.getByRole("combobox", { name: "搜索模组", exact: true });
  await input.fill("资源 18");
  await input.press("Enter");
  await module.getByRole("table").waitFor();
  assert.match(await module.getByRole("table").innerText(), /测试资源 18/);
  await module.getByRole("button", { name: /^模组 测试资源/ }).click();
  await input.press("Escape");
  assert.equal(await module.getByRole("dialog").count(), 0);
  await page.screenshot({ path: `${output}/module.png`, fullPage: true });

  await page.getByRole("tab", { name: "周期收益", exact: true }).click();
  const period = page.getByRole("tabpanel", { name: "周期收益", exact: true });
  await period.getByRole("region", { name: "周期收益趋势", exact: true }).waitFor();
  await period.getByRole("button", { name: "上一周期", exact: true }).click();
  await period.getByRole("region", { name: "周期收益趋势", exact: true }).waitFor();
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
  await realtime.getByText("已更新 · 筛选自动生效", { exact: true }).waitFor();
  await realtime.getByRole("button", { name: "今天", exact: true }).click();
  assert.equal(
    await realtime.getByRole("table").count(),
    2,
    "returning to today's exact scope immediately reuses its snapshot",
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
    }
  }
  await page.getByRole("tab", { name: "数据追踪", exact: true }).click();
  await page.evaluate(() => {
    __analyticsTest.controls.delay = 900;
    __analyticsTest.clearCache();
  });
  assert.equal(await tracking.getByRole("table").count(), 0, "explicit cache clearing discards visible snapshots");
  await tracking.getByRole("table").waitFor();
  await tracking.getByRole("button", { name: "近 30 天", exact: true }).click();
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText(/当前账号暂无可分析的手游资源/).waitFor();
  assert.equal(await page.getByRole("table").count(), 0, "late requests cannot expose another account's results");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: automatic filters, request coalescing, cache reuse, refresh recovery, preserved chart state, searchable resources, monthly paging, PE/PC isolation, cache clearing, account isolation and five tabs in three themes",
  );
} finally {
  await browser?.close();
  await server.close();
}
