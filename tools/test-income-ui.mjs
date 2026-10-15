import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/income-tests`;
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
  const page = await browser.newPage({ viewport: { width: 1360, height: 1100 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/income.html`);
  await page.getByText("筛选结果 16 笔").waitFor();
  assert.equal(await page.locator("#calls").textContent(), "1");
  assert.equal(await page.locator("tbody tr[data-selected]").count(), 12);
  await page.getByRole("button", { name: "下一页" }).click();
  assert.equal(await page.locator("tbody tr[data-selected]").count(), 4);
  await page.getByRole("combobox", { name: "结算状态" }).selectOption("init");
  assert.equal(await page.locator("tbody tr[data-selected]").count(), 3);
  assert.equal(await page.locator("#calls").textContent(), "1");
  await page.getByRole("button", { name: "查看详情" }).first().click();
  await page.locator("#income-detail").getByText("可结算月份明细").waitFor();
  const pendingHeight = await page
    .locator("#income-detail")
    .evaluate((detail) => detail.getBoundingClientRect().height);
  await page.waitForFunction(() => !document.querySelector("#income-detail")?.textContent.includes("正在更新详情"));
  const loadedHeight = await page.locator("#income-detail").evaluate((detail) => detail.getBoundingClientRect().height);
  assert.ok(Math.abs(loadedHeight - pendingHeight) <= 2, "loading must not collapse the detail panel");
  assert.equal(
    await page
      .locator("#income-detail")
      .evaluate((detail) => detail.closest("tr")?.previousElementSibling?.getAttribute("data-selected")),
    "true",
  );
  assert.equal(await page.locator("#calls").textContent(), "2");
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "收起详情", exact: true }).click();
    await page.getByRole("button", { name: "查看详情", exact: true }).first().click();
    assert.equal(await page.locator("#income-detail").getByText("正在更新详情…").count(), 0);
    assert.equal(await page.locator("#calls").textContent(), "2");
  }
  await page.screenshot({ path: `${output}/income-light.png`, fullPage: true });
  await page.getByRole("checkbox", { name: "模拟失败" }).check();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByText(/当前显示上次成功加载的数据/).waitFor();
  assert.equal(await page.locator("tbody tr[data-selected]").count(), 3);
  assert.equal(await page.locator("#calls").textContent(), "4");
  await page.getByRole("checkbox", { name: "模拟失败" }).uncheck();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes("加载失败"));
  await page.getByRole("button", { name: "电脑版 PC", exact: true }).click();
  assert.equal(await page.locator("tbody tr[data-selected]").count(), 0);
  await page.getByText("暂无月度收益记录").waitFor();
  await page.getByRole("button", { name: "手机版 PE", exact: true }).click();
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText("暂无月度收益记录").waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("tbody tr[data-selected]").count(), 0);
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText("筛选结果 16 笔").waitFor();
  await page.getByRole("button", { name: "深色主题", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.screenshot({ path: `${output}/income-dark.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: cached reopen adds 0 requests, stable loading height, explicit refresh, pagination, filters, details, failure/retry, platform and account isolation, light/dark layout",
  );
} finally {
  await browser?.close();
  await server.close();
}
