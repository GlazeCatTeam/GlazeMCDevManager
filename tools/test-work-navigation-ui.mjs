import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/work-navigation-ui`;
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
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname === "127.0.0.1") return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    const now = Date.now.bind(Date);
    globalThis.workClockOffset = 0;
    Date.now = () => now() + workClockOffset;
    localStorage.setItem(
      "fixture:host-archives:fixture-account",
      JSON.stringify(Array.from({ length: 10 }, (_, i) => String(1000 + i))),
    );
  });
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/work-editor.html?performance=1&slow=1`);
  const cards = () => page.getByRole("list", { name: "作品", exact: true }).getByRole("listitem");
  await cards().first().waitFor();
  await page.getByRole("button", { name: "第 3 页", exact: true }).click();
  await cards().filter({ hasText: "性能测试作品 29" }).waitFor();
  await page.evaluate(() => {
    const original = glaze.rpc;
    globalThis.navigationOriginalRpc = original;
    globalThis.navigationRequests = [];
    globalThis.releaseArchiveReads = [];
    globalThis.releaseListReads = [];
    globalThis.holdWorkLists = false;
    glaze.rpc = (method, params) => {
      navigationRequests.push({ method, params });
      if (method === "works.archiveState")
        return new Promise((resolve) => releaseArchiveReads.push(() => original(method, params).then(resolve)));
      if (method === "works.list" && holdWorkLists)
        return new Promise((resolve) => releaseListReads.push(() => original(method, params).then(resolve)));
      return original(method, params);
    };
  });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "作品管理", exact: true }).click();
  await cards().filter({ hasText: "性能测试作品 29" }).waitFor({ timeout: 1200 });
  assert.equal(
    await page.evaluate(() => navigationRequests.filter((entry) => entry.method === "works.archiveState").length),
    0,
    "returning to a warm work list must not wait for another archive-state request",
  );
  await page.screenshot({ path: `${output}/warm-return.png`, fullPage: true });
  await page.getByRole("button", { name: "归档管理", exact: true }).click();
  await cards().filter({ hasText: "性能测试作品 1" }).first().waitFor();
  await page.getByRole("button", { name: "第 2 页", exact: true }).click();
  await cards().filter({ hasText: "性能测试作品 10" }).waitFor();
  await page.getByRole("button", { name: "返回作品列表", exact: true }).click();
  await cards().filter({ hasText: "性能测试作品 29" }).waitFor();
  const started = Date.now();
  for (let i = 0; i < 10; i++) {
    await page.getByRole("button", { name: "归档管理", exact: true }).click();
    await cards().filter({ hasText: "性能测试作品 10" }).waitFor({ timeout: 1200 });
    await page.getByRole("button", { name: "返回作品列表", exact: true }).click();
    await cards().filter({ hasText: "性能测试作品 29" }).waitFor({ timeout: 1200 });
  }
  assert.equal(
    await page.evaluate(() => navigationRequests.filter((entry) => entry.method === "works.list").length),
    0,
    "cached filtering, pagination and view switching share one source without another full-list request",
  );
  console.log(`20 cached view switches: ${Date.now() - started}ms`);
  await page.evaluate(() => {
    workClockOffset = 31_000;
    holdWorkLists = true;
  });
  await page.getByRole("button", { name: "第 4 页", exact: true }).click();
  await cards().filter({ hasText: "性能测试作品 38" }).waitFor({ timeout: 1200 });
  await page.getByRole("button", { name: "第 5 页", exact: true }).click();
  await cards().filter({ hasText: "性能测试作品 47" }).waitFor({ timeout: 1200 });
  assert.equal(
    await page.evaluate(() => navigationRequests.filter((entry) => entry.method === "works.list").length),
    1,
    "expired source data revalidates once while cached page changes remain usable",
  );
  await page.evaluate(async () => {
    holdWorkLists = false;
    await Promise.all(releaseListReads.map((release) => release()));
  });
  await page.getByRole("list", { name: "作品", exact: true }).and(page.locator('[aria-busy="false"]')).waitFor();
  await page.getByRole("button", { name: "归档管理", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "作品管理", exact: true }).click();
  await page.getByRole("heading", { name: "归档管理", exact: true }).waitFor();
  await cards().filter({ hasText: "性能测试作品 10" }).waitFor({ timeout: 1200 });
  await page.screenshot({ path: `${output}/archive-return.png`, fullPage: true });
  await page.evaluate(() => {
    navigationRequests.length = 0;
  });
  await cards()
    .filter({ hasText: "性能测试作品 10" })
    .getByRole("button", { name: "恢复 性能测试作品 10", exact: true })
    .click();
  await page.getByRole("navigation", { name: "分页", exact: true }).waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => navigationRequests.filter((entry) => entry.method === "works.editor").length),
    0,
    "archive controls must not prefetch the complete editor on focus",
  );
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/work-editor.html?performance=1&archiveReadFailure=1`);
  const retry = page.getByRole("button", { name: "重试归档记录", exact: true });
  await retry.waitFor();
  assert.equal(await retry.isEnabled(), true);
  assert.equal(await cards().count(), 0, "unverified archives must not expose hidden works while a read fails");
  await page.evaluate(() => workNavigationFixture.failArchiveRead(false));
  await retry.click();
  await cards().first().waitFor();
  await page.getByText("模拟归档记录读取失败", { exact: true }).waitFor({ state: "hidden" });
  await page.screenshot({ path: `${output}/read-recovered.png`, fullPage: true });
  await page.getByRole("button", { name: "第 3 页", exact: true }).click();
  const detailCard = cards().filter({ hasText: "性能测试作品 29" });
  await detailCard.getByRole("button", { name: "查看 性能测试作品 29 详情", exact: true }).click();
  await page.getByRole("tab", { name: "基本信息", exact: true }).waitFor();
  await page.getByRole("button", { name: "‹ 返回作品管理", exact: true }).click();
  await detailCard.waitFor({ timeout: 1200 });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: warm route/editor return, shared filtered pagination, rapid switching, independent positions, expired-source revalidation, focus prefetch suppression and failed-read recovery; zero external requests",
  );
} finally {
  await browser?.close();
  await server.close();
}
