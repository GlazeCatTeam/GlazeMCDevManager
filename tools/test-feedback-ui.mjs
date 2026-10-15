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
  const page = await browser.newPage({ viewport: { width: 1360, height: 1150 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/feedback.html`);
  const list = page.getByRole("region", { name: "反馈列表", exact: true });
  const pagination = page.getByRole("navigation", { name: "分页" });
  const draft = page.getByPlaceholder("回复这条反馈…");

  /** Wait for a settled page and verify its records and selected page agree */
  const expectPage = async (number, count, firstPlayer) => {
    await page.getByText(`共 25 条 · 当前页 ${count} 条 · 当前页未回复 ${count}`, { exact: true }).waitFor();
    await list.getByText(`测试玩家${firstPlayer}`, { exact: true }).waitFor();
    assert.equal(await list.getByRole("listitem").count(), count);
    assert.equal(
      await pagination.getByRole("button", { name: `第 ${number} 页`, exact: true }).getAttribute("aria-current"),
      "page",
    );
  };

  await expectPage(1, 20, 1);
  assert.equal(await page.getByRole("button", { name: "加载更多反馈", exact: true }).count(), 0);
  assert.equal(await pagination.getByRole("button", { name: "‹ 上一页", exact: true }).isDisabled(), true);
  await draft.fill("跨页保留的草稿");
  await pagination.getByRole("button", { name: "下一页 ›", exact: true }).click();
  await expectPage(2, 5, 21);
  assert.equal(await draft.inputValue(), "");
  assert.equal(await pagination.getByRole("button", { name: "下一页 ›", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expectPage(2, 5, 21);
  await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
  await pagination.getByRole("spinbutton", { name: "跳转页码" }).fill("1");
  await pagination.getByRole("button", { name: "跳转", exact: true }).click();
  await expectPage(1, 20, 1);
  assert.equal(await draft.inputValue(), "跨页保留的草稿");

  await page.getByLabel("读取失败", { exact: true }).check();
  await pagination.getByRole("button", { name: "第 2 页", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await list.getByRole("listitem").count(), 0);
  await list.getByText("反馈加载失败", { exact: true }).waitFor();
  await page.getByLabel("读取失败", { exact: true }).uncheck();
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expectPage(2, 5, 21);
  await page.getByLabel("读取失败", { exact: true }).check();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await expectPage(2, 5, 21);
  await page.getByLabel("读取失败", { exact: true }).uncheck();
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByRole("button", { name: "刷新", exact: true }).waitFor();

  await page.getByRole("button", { name: "组件冲突", exact: true }).click();
  await list.getByText("测试玩家3", { exact: true }).waitFor();
  assert.equal(await list.getByRole("listitem").count(), 1);
  assert.equal(await pagination.count(), 0);
  await page.getByRole("button", { name: "全部", exact: true }).last().click();
  await expectPage(1, 20, 1);
  await pagination.getByRole("button", { name: "第 2 页", exact: true }).click();
  await expectPage(2, 5, 21);
  await page.getByPlaceholder("搜索昵称、内容、组件名…").fill("离线反馈 1：");
  await page.getByText("共 1 条 · 当前页 1 条 · 当前页未回复 1", { exact: true }).waitFor();
  assert.equal(await pagination.count(), 0);
  await page.getByPlaceholder("搜索昵称、内容、组件名…").fill("");
  await expectPage(1, 20, 1);
  await page.getByRole("button", { name: "已回复", exact: true }).click();
  await list.getByText("没有符合条件的反馈", { exact: true }).waitFor();
  assert.equal(await pagination.count(), 0);
  await page.getByRole("button", { name: "全部", exact: true }).first().click();
  await expectPage(1, 20, 1);

  await page.getByLabel("延迟响应", { exact: true }).check();
  await pagination.getByRole("button", { name: "第 2 页", exact: true }).click();
  await list.getByText("正在加载反馈…", { exact: true }).waitFor();
  await pagination.getByRole("button", { name: "第 1 页", exact: true }).click();
  await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
  await expectPage(1, 20, 1);
  await pagination.getByRole("button", { name: "第 2 页", exact: true }).click();
  await list.getByText("正在加载反馈…", { exact: true }).waitFor();
  await page.getByRole("button", { name: "账号 B", exact: true }).click();
  await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
  assert.equal(await list.getByRole("listitem").count(), 0);
  assert.equal(await pagination.count(), 0);
  await page.getByLabel("延迟响应", { exact: true }).uncheck();
  await page.getByRole("button", { name: "账号 A", exact: true }).click();
  await expectPage(1, 20, 1);
  assert.equal(await draft.inputValue(), "");

  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/feedback.html?reply-filter=1`);
  await list.getByText("测试玩家1", { exact: true }).waitFor();
  await pagination.getByRole("button", { name: "第 2 页", exact: true }).click();
  await list.getByText("测试玩家21", { exact: true }).waitFor();
  await page.getByRole("button", { name: "已回复", exact: true }).click();
  await page.getByText("筛选后共 3 条 · 当前页 3 条 · 当前页未回复 0", { exact: true }).waitFor();
  for (const player of [1, 21, 25]) await list.getByText(`测试玩家${player}`, { exact: true }).waitFor();
  assert.equal(await pagination.count(), 0);
  await page.getByRole("button", { name: "组件冲突", exact: true }).click();
  await page.getByText("筛选后共 0 条 · 当前页 0 条 · 当前页未回复 0", { exact: true }).waitFor();
  await page.getByRole("button", { name: "全部", exact: true }).last().click();
  await page.getByText("筛选后共 3 条 · 当前页 3 条 · 当前页未回复 0", { exact: true }).waitFor();
  await page.getByRole("button", { name: "未回复", exact: true }).click();
  await page.getByText("筛选后共 22 条 · 当前页 20 条 · 当前页未回复 20", { exact: true }).waitFor();
  await pagination.getByRole("button", { name: "下一页 ›", exact: true }).click();
  await page.getByText("筛选后共 22 条 · 当前页 2 条 · 当前页未回复 2", { exact: true }).waitFor();
  await list.getByText("测试玩家23", { exact: true }).waitFor();
  await list.getByText("测试玩家24", { exact: true }).waitFor();
  await page.getByLabel("读取失败", { exact: true }).check();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await list.getByRole("listitem").count(), 2);
  await page.getByLabel("读取失败", { exact: true }).uncheck();
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
  for (const remaining of [21, 20]) {
    await draft.fill("离线回复测试");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await page
      .getByText(
        `筛选后共 ${remaining} 条 · 当前页 ${remaining === 21 ? 1 : 20} 条 · 当前页未回复 ${remaining === 21 ? 1 : 20}`,
        { exact: true },
      )
      .waitFor();
  }
  assert.equal(await pagination.count(), 0);
  await page.getByRole("button", { name: "已回复", exact: true }).click();
  await page.getByText("筛选后共 5 条 · 当前页 5 条 · 当前页未回复 0", { exact: true }).waitFor();
  await page.screenshot({ path: `${root}node_modules/.cache/feedback-pagination.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: feedback paging, global reply filters, filtered totals, reply repagination, refresh/retry, drafts and account isolation",
  );
} finally {
  await browser?.close();
  await server.close();
}
