import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/tracking-tests`;
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
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/analytics.html?dense`);
  const panel = page.getByRole("tabpanel", { name: "数据追踪" });
  const top10 = panel.getByRole("button", { name: "Top 10", exact: true });
  await panel.getByRole("table").waitFor();
  await panel.getByRole("button", { name: "清空", exact: true }).click();
  await top10.click();
  await panel.getByText(/按新增购买区间合计降序展示 10/).waitFor();
  assert.equal(await panel.getByRole("group", { name: "已选对比资源" }).getByRole("button").count(), 10);
  assert.equal(await panel.getByRole("table").getByRole("row").count(), 11);
  const calls = await page.locator("#calls").textContent();
  await panel.getByRole("button", { name: "销售总量", exact: true }).click();
  await panel.getByText(/按销售总量区间合计降序展示 10/).waitFor();
  assert.equal(await page.locator("#calls").textContent(), calls, "metric changes reuse all-resource data");
  await panel.getByRole("button", { name: "近 7 天", exact: true }).click();
  await top10.click();
  await panel.getByText(/共 10 个资源 · 7 天/).waitFor();
  await page.screenshot({ path: `${output}/top10.png`, fullPage: true });
  await page.setViewportSize({ width: 760, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/top10-narrow.png`, fullPage: true });
  await panel.getByRole("group", { name: "已选对比资源" }).getByRole("button").first().click();
  await panel.getByText(/共 9 个资源 · 7 天/).waitFor();
  assert.equal(await panel.getByText(/区间合计降序展示/).count(), 0, "manual selection exits top ten mode");
  await page.getByRole("button", { name: "模拟请求失败", exact: true }).click();
  await panel.getByRole("button", { name: "近 30 天", exact: true }).click();
  await top10.click();
  await panel.getByText(/数据加载失败/).waitFor();
  assert.equal(
    await panel.getByRole("table").count(),
    1,
    "failed ranking keeps the explicitly labelled previous scope",
  );
  await panel.getByText(/数据加载失败.*已保留/).waitFor();
  await page.getByRole("button", { name: "恢复请求", exact: true }).click();
  await panel.getByRole("button", { name: "重试", exact: true }).click();
  await panel.getByText(/共 10 个资源 · 30 天/).waitFor();
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText(/当前账号暂无可分析的手游资源/).waitFor();
  assert.equal(await panel.getByRole("table").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Tracking UI passed: top ten, metric/range changes, manual selection, failure recovery, account scope and narrow layout",
  );
} finally {
  await browser?.close();
  await server.close();
}
