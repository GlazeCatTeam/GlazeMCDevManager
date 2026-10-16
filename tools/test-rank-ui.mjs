import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/rank-tests`;
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/rank.html`);
  await page.getByText("a:pe_hot:mod:work-0", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => rankTest.calls.length), 1, "StrictMode shares initial request");
  const list = page.locator("ol[aria-label]");
  const geometry = await list.boundingBox();
  await page.getByRole("tab", { name: "手游免费榜", exact: true }).click();
  assert.equal(await list.locator("li").count(), 8, "cold tabs reserve all eight rows");
  assert.equal(
    await list.getByText("a:pe_hot:mod:work-0", { exact: true }).count(),
    0,
    "old board never appears under new tab",
  );
  await page.getByText("a:pe_download:mod:work-0", { exact: true }).waitFor();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("tab", { name: "手游热门飙升", exact: true }).click();
    await page.getByRole("tab", { name: "手游免费榜", exact: true }).click();
    assert.equal(await page.getByRole("status").textContent(), "");
  }
  assert.equal(await page.evaluate(() => rankTest.calls.length), 2, "ten cached tab switches add zero RPCs");
  await page.getByRole("tab", { name: "热搜榜", exact: true }).hover();
  await page.waitForTimeout(300);
  await page.getByRole("tab", { name: "热搜榜", exact: true }).click();
  assert.equal(await page.getByRole("status").textContent(), "");
  const searchGeometry = await list.boundingBox();
  assert.equal(searchGeometry.y, geometry.y, "hot search keeps category space");
  assert.equal(searchGeometry.height, geometry.height);
  await page.getByRole("tab", { name: "手游免费榜", exact: true }).click();
  await page.evaluate(() => {
    rankTest.controls.delay = 700;
  });
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await page.getByRole("button", { name: "模组", exact: true }).click();
  await page.waitForTimeout(750);
  assert.equal(
    await page.getByText("a:pe_download:mod:work-0", { exact: true }).count(),
    1,
    "late category response cannot overwrite active rows",
  );
  await page.evaluate(() => {
    rankTest.controls.fail = true;
    rankTest.controls.delay = 80;
  });
  await page.getByRole("button", { name: "刷新排行榜" }).click();
  await page.getByText(/榜单加载失败/).waitFor();
  assert.equal(await list.getByText(/:work-\d+$/).count(), 50, "refresh failure retains rows");
  await page.evaluate(() => {
    rankTest.controls.fail = false;
  });
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.waitForFunction(() => !document.body.textContent.includes("榜单加载失败"));
  await page.getByRole("button", { name: "切换测试账号" }).click();
  assert.equal(await list.getByText("a:pe_download:mod:work-0", { exact: true }).count(), 0);
  await page.getByText("b:pe_download:mod:work-0", { exact: true }).waitFor();
  await page.getByRole("button", { name: "联机大厅", exact: true }).click();
  await page.getByText("这个榜单暂时没有作品").waitFor();
  await page.getByRole("tab", { name: "手游热门飙升", exact: true }).click();
  await page.getByRole("button", { name: "模组", exact: true }).click();
  await page.getByText("b:pe_hot:mod:work-0", { exact: true }).waitFor();
  const count = await page.evaluate(() => rankTest.calls.length);
  await page.getByRole("button", { name: "切换页面", exact: true }).click();
  await page.getByRole("button", { name: "切换页面", exact: true }).click();
  assert.equal(await page.getByText("b:pe_hot:mod:work-0", { exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => rankTest.calls.length), count, "route re-entry uses the cached ranking");
  assert.equal(await page.getByRole("tab").count(), 4, "all board tabs are available by default");
  assert.equal(await page.getByRole("button", { name: "查看全部榜单" }).count(), 0);
  assert.equal(await list.getByText(/:work-\d+$/).count(), 50);
  await page.evaluate(() => {
    rankTest.controls.fail = true;
  });
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await list.getByText("测试网络失败", { exact: true }).waitFor();
  assert.equal(await list.getByText(/:work-\d+$/).count(), 50, "a failed append retains the first page");
  const failedCalls = await page.evaluate(() => rankTest.calls.length);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => rankTest.calls.length), failedCalls, "failed append does not retry in a loop");
  await page.evaluate(() => {
    rankTest.controls.fail = false;
  });
  await list.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByText("b:pe_hot:mod:work-99", { exact: true }).waitFor();
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.getByText("已显示全部 123 条", { exact: true }).waitFor();
  assert.equal(await list.getByText(/:work-\d+$/).count(), 123);
  assert.equal((await list.boundingBox()).height, geometry.height, "appending rows preserves list geometry");
  const tabs = page.getByRole("tablist", { name: "榜单" });
  await page.setViewportSize({ width: 360, height: 800 });
  await tabs.hover();
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(() => document.querySelector('[role="tablist"]').scrollLeft > 0);
  await page.getByRole("tab", { name: "手游畅销榜", exact: true }).click();
  await page.getByText("b:pe_sell:mod:work-0", { exact: true }).waitFor();
  assert.equal(await list.evaluate((el) => el.scrollTop), 0);
  await page.evaluate(() => {
    rankTest.controls.delay = 400;
  });
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await list.getByText("正在加载更多…", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "手游热门飙升", exact: true }).click();
  await page.getByRole("tab", { name: "手游畅销榜", exact: true }).click();
  await page.waitForTimeout(450);
  assert.equal(
    await list.getByText(/:work-\d+$/).count(),
    50,
    "discard an append from before a rapid leave and return",
  );
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.getByText("b:pe_sell:mod:work-99", { exact: true }).waitFor();
  assert.equal(await list.getByText(/:work-\d+$/).count(), 100, "returning to a board can append again");
  await page.screenshot({ path: `${output}/rank-dark.png` });
  await page.getByRole("button", { name: "浅色主题", exact: true }).click();
  await page.setViewportSize({ width: 480, height: 760 });
  await page.screenshot({ path: `${output}/rank-light.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: zero extra RPCs for 10 cached switches, prefetch, stable geometry, race/account isolation, refresh retry, empty state, route re-entry, light/dark",
  );
} finally {
  await browser?.close();
  await server.close();
}
