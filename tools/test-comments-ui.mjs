import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
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
  const page = await browser.newPage({ viewport: { width: 1360, height: 1050 } });
  const output = new URL("../node_modules/.cache/comments-ui/", import.meta.url);
  await mkdir(output, { recursive: true });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/comments.html?sparse-ratings=1`);
  const list = page.getByRole("region", { name: "评论列表", exact: true });
  const pagination = page.getByRole("navigation", { name: "分页" });
  const rating = (value) =>
    page
      .getByRole("group", { name: "评分，多选", exact: true })
      .getByRole("button", { name: String(value), exact: true });
  await page.getByText("共 30 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await pagination.getByRole("button", { name: "第 2 页", exact: true }).click();
  await page.getByText("共 30 条评论 · 当前页 10 条", { exact: true }).waitFor();
  await rating(1).click();
  await page.getByText("筛选后共 2 条评论 · 当前页 2 条", { exact: true }).waitFor();
  assert.equal(await list.getByRole("listitem").count(), 2);
  await list.getByText("玩家甲1", { exact: true }).waitFor();
  await list.getByText("玩家甲22", { exact: true }).waitFor();
  assert.equal(await pagination.count(), 0);

  await rating(1).click();
  await rating(5).click();
  await page.getByText("筛选后共 28 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await pagination.getByRole("button", { name: "下一页 ›", exact: true }).click();
  await page.getByText("筛选后共 28 条评论 · 当前页 8 条", { exact: true }).waitFor();
  assert.equal(await list.getByRole("listitem").count(), 8);
  await pagination.getByRole("spinbutton", { name: "跳转页码" }).fill("1");
  await pagination.getByRole("button", { name: "跳转", exact: true }).click();
  await page.getByText("筛选后共 28 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await rating(1).click();
  await page.getByText("筛选后共 30 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await rating(5).click();
  await page.getByText("筛选后共 2 条评论 · 当前页 2 条", { exact: true }).waitFor();
  await page.getByRole("button", { name: "问题求助", exact: true }).click();
  await page.getByText("筛选后共 1 条评论 · 当前页 1 条", { exact: true }).waitFor();
  await list.getByText("玩家甲22", { exact: true }).waitFor();
  await rating(1).click();
  await rating(3).click();
  await page.getByText("筛选后共 0 条评论 · 当前页 0 条", { exact: true }).waitFor();
  assert.equal(await pagination.count(), 0);
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText("共 1 条评论 · 当前页 1 条", { exact: true }).waitFor();
  await list.getByText("玩家乙1", { exact: true }).waitFor();

  await page.goto(
    `${server.resolvedUrls.local[0]}tests/fixtures/comments.html?sparse-ratings=1&progressive=1&fail-later=1`,
  );
  await page.getByText("共 230 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await rating(1).click();
  await page.getByText("已检查 100 / 230 条评论，已找到 1 条匹配 · 继续加载中…", { exact: true }).waitFor();
  await list.getByText("玩家甲1", { exact: true }).waitFor();
  assert.equal(await list.getByRole("listitem").count(), 1);
  await rating(5).click();
  await page.getByText("已检查 100 / 230 条评论，已找到 100 条匹配 · 继续加载中…", { exact: true }).waitFor();
  await rating(5).click();
  await page.getByText("已检查 100 / 230 条评论，已找到 1 条匹配 · 继续加载中…", { exact: true }).waitFor();
  assert.equal(await page.locator("#list-count").textContent(), "列表请求数：3");
  await page.getByText("评论加载失败：离线测试网络失败", { exact: false }).waitFor();
  await list.getByText("玩家甲1", { exact: true }).waitFor();
  await page.getByText("已加载匹配 1 条评论 · 当前页 1 条", { exact: true }).waitFor();
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByText("筛选后共 2 条评论 · 当前页 2 条", { exact: true }).waitFor();
  await list.getByText("玩家甲122", { exact: true }).waitFor();
  assert.equal(await list.getByRole("listitem").count(), 2);

  // Refresh must keep a selected comment and its detail visible before the first response
  await list.getByText("玩家甲122", { exact: true }).click();
  await page.getByRole("button", { name: "慢速请求", exact: true }).click();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await list.getByText("玩家甲122", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "玩家甲122", exact: true }).waitFor();
  await page
    .getByText("已检查 100 / 230 条评论，已找到 1 条匹配 · 继续加载中，当前显示上次结果…", { exact: true })
    .waitFor();
  await page.getByRole("heading", { name: "玩家甲122", exact: true }).waitFor();
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText("共 1 条评论 · 当前页 1 条", { exact: true }).waitFor();
  await list.getByText("玩家乙1", { exact: true }).waitFor();
  assert.equal(await list.getByText("玩家甲122", { exact: true }).count(), 0);

  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/comments.html?empty-content=1`);
  const hideEmpty = page.getByRole("checkbox", { name: "屏蔽无文字评论", exact: true });
  await page.getByText("共 43 条评论 · 当前页 20 条", { exact: true }).waitFor();
  assert.equal(await hideEmpty.isChecked(), false);
  await page.getByText("（该评论没有文字内容）", { exact: true }).waitFor();
  await pagination.getByRole("button", { name: "第 3 页", exact: true }).click();
  await page.getByText("共 43 条评论 · 当前页 3 条", { exact: true }).waitFor();
  await hideEmpty.check();
  await page.getByText("筛选后共 28 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "玩家甲2", exact: true }).waitFor();
  assert.equal(await page.getByText("（该评论没有文字内容）", { exact: true }).count(), 0);
  await pagination.getByRole("button", { name: "下一页 ›", exact: true }).click();
  await page.getByText("筛选后共 28 条评论 · 当前页 8 条", { exact: true }).waitFor();
  assert.equal(await list.getByRole("listitem").count(), 8);
  await hideEmpty.uncheck();
  await page.getByText("共 43 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await page.getByText("（该评论没有文字内容）", { exact: true }).waitFor();
  await hideEmpty.check();
  await page.getByText("筛选后共 28 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await rating(5).click();
  await page.getByText("筛选后共 5 条评论 · 当前页 5 条", { exact: true }).waitFor();
  await page.getByRole("button", { name: "默认类型", exact: true }).click();
  await page.getByText("筛选后共 3 条评论 · 当前页 3 条", { exact: true }).waitFor();
  const search = page.getByPlaceholder("搜索昵称、内容、组件名…");
  await search.fill("评论内容 15");
  await page.getByText("筛选后共 1 条评论 · 当前页 1 条", { exact: true }).waitFor();
  await list.getByText("玩家甲15", { exact: true }).waitFor();
  await search.fill("不存在的评论");
  await page.getByText("筛选后共 0 条评论 · 当前页 0 条", { exact: true }).waitFor();
  assert.equal(await pagination.count(), 0);
  await page.getByRole("button", { name: "切换测试账号", exact: true }).click();
  await page.getByText("共 1 条评论 · 当前页 1 条", { exact: true }).waitFor();
  assert.equal(await hideEmpty.isChecked(), false);

  // A scrollable, short window exposes anchoring jumps that fixed-height assertions alone miss
  await page.setViewportSize({ width: 1360, height: 800 });
  await page.goto(
    `${server.resolvedUrls.local[0]}tests/fixtures/comments.html?sparse-ratings=1&progressive=1&long-content=1&out-of-order=1`,
  );
  await page.getByText("共 230 条评论 · 当前页 20 条", { exact: true }).waitFor();
  const main = page.getByRole("main", { name: "评论测试页面" });
  const detail = page.getByRole("region", { name: "评论详情", exact: true });
  const listNode = await list.elementHandle();
  const detailNode = await detail.elementHandle();
  await list.getByRole("list").evaluate((element) => {
    element.scrollTop = 160;
  });
  await detail
    .locator(":scope > div")
    .first()
    .evaluate((element) => {
      element.scrollTop = 240;
    });
  await main.evaluate((element) => {
    element.scrollTop = 180;
  });
  await page.evaluate(() => {
    window.commentLayoutSamples = [];
    window.commentLayoutTimer = setInterval(() => {
      if (window.commentLayoutPaused) return;
      const main = document.querySelector("main");
      const list = document.querySelector('[aria-label="评论列表"]');
      const detail = document.querySelector('[aria-label="评论详情"]');
      window.commentLayoutSamples.push({
        scroll: main.scrollTop,
        height: main.scrollHeight,
        top: list.getBoundingClientRect().top,
        listBottom: list.getBoundingClientRect().bottom,
        detailBottom: detail.getBoundingClientRect().bottom,
      });
    }, 25);
  });
  await page.getByRole("button", { name: "慢速请求", exact: true }).click();
  // Dispatch avoids Playwright scrolling an off-screen filter into view during layout measurements
  await page.getByRole("button", { name: "刷新", exact: true }).dispatchEvent("click");
  await page.getByText("正在更新评论，当前显示上次加载结果…", { exact: true }).waitFor();
  assert.equal(await list.getByRole("list").evaluate((element) => element.scrollTop), 160);
  assert.equal(
    await detail
      .locator(":scope > div")
      .first()
      .evaluate((element) => element.scrollTop),
    240,
  );
  await page.getByText("共 230 条评论 · 当前页 20 条", { exact: true }).waitFor();
  assert.equal(await list.getByRole("list").evaluate((element) => element.scrollTop), 160);
  assert.equal(
    await detail
      .locator(":scope > div")
      .first()
      .evaluate((element) => element.scrollTop),
    240,
  );
  await rating(1).dispatchEvent("click");
  await page.getByText("已检查 100 / 230 条评论，已找到 1 条匹配 · 继续加载中…", { exact: true }).waitFor();
  assert.equal(await list.getByRole("list").evaluate((element) => element.scrollTop), 0);
  await page.screenshot({ path: fileURLToPath(new URL("loading.png", output)) });
  await page.getByText("筛选后共 2 条评论 · 当前页 2 条", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.commentLayoutPaused = true;
  });
  await page.getByRole("textbox", { name: "回复玩家甲1", exact: true }).fill("保留这条回复草稿");
  // Filling the reply is an intentional user scroll; start a new measurement from the previous viewport
  await main.evaluate((element) => {
    element.scrollTop = 180;
  });
  await page.evaluate(() => {
    window.commentLayoutPaused = false;
  });
  await page.getByRole("button", { name: "问题求助", exact: true }).dispatchEvent("click");
  await page.getByText("正在应用筛选 · 暂时保留上次结果", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "玩家甲1", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "发送回复", exact: true }).isDisabled(), true);
  await page.getByText("筛选后共 1 条评论 · 当前页 1 条", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "玩家甲122", exact: true }).waitFor();
  await page.getByRole("button", { name: "模拟请求失败", exact: true }).click();
  await page.getByRole("button", { name: "默认类型", exact: true }).dispatchEvent("click");
  await page.getByRole("alert").waitFor();
  await page.getByText("筛选未完成 · 当前显示上次结果", { exact: true }).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL("error.png", output)) });
  await page.getByRole("heading", { name: "玩家甲122", exact: true }).waitFor();
  await page.getByRole("button", { name: "恢复请求", exact: true }).click();
  await page.getByRole("button", { name: "重试", exact: true }).dispatchEvent("click");
  await page.getByRole("heading", { name: "玩家甲1", exact: true }).waitFor();
  await page.getByText("筛选后共 1 条评论 · 当前页 1 条", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "回复玩家甲1", exact: true }).inputValue(), "保留这条回复草稿");
  await rating(3).dispatchEvent("click");
  await rating(1).dispatchEvent("click");
  await page.getByText("筛选后共 0 条评论 · 当前页 0 条", { exact: true }).waitFor();
  await list.getByText("没有符合条件的评论", { exact: true }).waitFor();
  const samples = await page.evaluate(() => {
    clearInterval(window.commentLayoutTimer);
    return window.commentLayoutSamples;
  });
  assert.ok(samples.length > 10);
  // Exclude the explicit reply-field focus scroll, which is expected browser behavior
  assert.ok(
    samples.every((sample) => sample.height === samples[0].height),
    "loading/error/pagination changed page height",
  );
  assert.ok(
    samples.every((sample) => Math.abs(sample.listBottom - sample.detailBottom) < 1),
    "panel bottoms moved apart",
  );
  assert.ok(
    samples.every((sample) => sample.scroll === 180),
    "query update moved the page scroll position",
  );
  assert.ok(
    samples.every((sample) => Math.abs(sample.top - samples[0].top) < 1),
    "query update moved the result panels",
  );
  assert.equal(await listNode.evaluate((element) => element.isConnected), true, "list panel was remounted");
  assert.equal(await detailNode.evaluate((element) => element.isConnected), true, "detail panel was remounted");

  // Reset must also cancel a search that has not reached the debounce deadline
  await search.fill("不存在的评论");
  await page.getByRole("button", { name: "重置筛选", exact: true }).click();
  await page.getByText("共 230 条评论 · 当前页 20 条", { exact: true }).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await search.inputValue(), "");
  assert.equal(await hideEmpty.isChecked(), false);
  await page.getByText("共 230 条评论 · 当前页 20 条", { exact: true }).waitFor();

  // Late responses from an abandoned search must never replace the latest selected filter
  await search.fill("玩家甲22");
  await page.getByText("正在应用筛选 · 暂时保留上次结果", { exact: true }).waitFor();
  await search.fill("玩家甲15");
  await page.getByText("共 11 条评论 · 当前页 11 条", { exact: true }).waitFor();
  await list.getByText("玩家甲15", { exact: true }).waitFor();
  await page.waitForFunction(() => window.commentTest.completedQueries.includes("玩家甲22"));
  assert.equal(await list.getByText("玩家甲22", { exact: true }).count(), 0);
  assert.equal(await page.locator("#reply-count").textContent(), "回复请求数：0");

  for (const [name, query] of [
    ["dark", ""],
    ["light", "&variant=light"],
    ["fluent", "&theme=fluent"],
  ]) {
    await page.setViewportSize({ width: 1360, height: 1200 });
    await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/comments.html?sparse-ratings=1${query}`);
    await page.getByText("共 30 条评论 · 当前页 20 条", { exact: true }).waitFor();
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
    await page.setViewportSize({ width: 900, height: 800 });
    assert.equal(await main.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
    const left = await list.boundingBox();
    const right = await detail.boundingBox();
    assert.ok(Math.abs(left.y + left.height - right.y - right.height) < 1);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-narrow.png`, output)) });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: filters/pagination, progressive matches, retry, account isolation, stable panel/page geometry, reading position, drafts, stale responses, reset and 3 themes",
  );
} finally {
  await browser?.close();
  await server.close();
}
