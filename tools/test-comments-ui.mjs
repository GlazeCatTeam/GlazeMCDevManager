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
  const page = await browser.newPage({ viewport: { width: 1360, height: 1050 } });
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
  assert.deepEqual(errors, []);
  console.log(
    "PASS: cross-page rating matches share one page, filtered totals, next/jump, multiselect, filter reset, empty results and account isolation",
  );
} finally {
  await browser?.close();
  await server.close();
}
