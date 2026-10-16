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
  await page.route("glaze-image://**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
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
  assert.equal(
    await page.evaluate(() => rankTest.iconCalls.length),
    2,
    "cover reads coalesce while both requests are held",
  );
  assert.equal(await list.locator("img").count(), 0, "text and navigation work while cover service is stalled");
  await page.getByRole("tab", { name: "热搜榜", exact: true }).hover();
  await page.waitForTimeout(300);
  await page.getByRole("tab", { name: "热搜榜", exact: true }).click();
  assert.equal(await page.getByRole("status").textContent(), "");
  const searchGeometry = await list.boundingBox();
  assert.ok(searchGeometry.y < geometry.y, "hot search removes unused category space");
  assert.equal(
    searchGeometry.y + searchGeometry.height,
    geometry.y + geometry.height,
    "hot search expands the list within the fixed card",
  );
  const tabGeometry = await page.getByRole("tablist", { name: "榜单" }).boundingBox();
  assert.ok(
    searchGeometry.y - tabGeometry.y - tabGeometry.height <= 18,
    "hot search follows the tabs with only the normal panel gap",
  );
  await page.screenshot({ path: `${output}/rank-hot-search.png` });
  await page.getByRole("tab", { name: "手游免费榜", exact: true }).click();
  assert.deepEqual(await list.boundingBox(), geometry, "category boards restore their original layout");
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
  await page.evaluate(() => rankTest.releaseIcons());
  await page.getByRole("button", { name: "放大预览：b:pe_download:mod:work-0", exact: true }).waitFor();
  assert.equal(await list.locator('img[src*="test-1"]').count(), 0, "late account A covers never enter account B rows");
  await page.getByRole("button", { name: "放大预览：b:pe_download:mod:work-0", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const backdrop = await dialog.evaluate((el) => {
    const rect = el.parentElement.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  assert.deepEqual(backdrop, { x: 0, y: 0, width: 1000, height: 800 }, "row containment never clips the cover preview");
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
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
  const loadedScroll = await list.evaluate((el) => el.scrollTop);
  await page.evaluate(() => {
    rankTest.controls.fail = true;
    rankTest.controls.delay = 400;
  });
  await page.getByRole("button", { name: "刷新排行榜" }).click();
  assert.equal(await list.getByText(/:work-\d+$/).count(), 123, "refresh keeps every loaded page while pending");
  await page.getByText(/榜单加载失败/).waitFor();
  assert.equal(await list.getByText(/:work-\d+$/).count(), 123, "failed refresh keeps appended pages");
  assert.equal(await list.evaluate((el) => el.scrollTop), loadedScroll, "failed refresh retains scroll position");
  await page.evaluate(() => {
    rankTest.controls.fail = false;
    rankTest.controls.delay = 80;
  });
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
    el.scrollTop = el.scrollHeight - el.clientHeight * 1.75;
  });
  await list.getByText("正在加载更多…", { exact: true }).waitFor();
  assert.equal(
    await list.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight > 120),
    true,
    "next page starts before reaching the old bottom threshold",
  );
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
  await page.evaluate(() => {
    rankTest.controls.failIcons = true;
  });
  await page.getByRole("button", { name: "材质光影", exact: true }).click();
  await page.getByText("b:pe_sell:texture:work-0", { exact: true }).waitFor();
  await page.waitForTimeout(100);
  assert.equal(await list.getByText(/:work-\d+$/).count(), 50, "cover service failures preserve all text rows");
  assert.equal(await page.getByRole("status").textContent(), "");
  assert.equal(await page.getByText(/榜单加载失败/).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: cached switches, stalled/failed covers, account isolation, full-screen cover preview, early pagination, 123-row refresh retention, stable scroll, retry, light/dark",
  );
} finally {
  await browser?.close();
  await server.close();
}
