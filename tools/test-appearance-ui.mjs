import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// An optional argument locates Playwright when it is installed outside this workspace
const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/appearance.html`);

  /** Wait for host confirmation before issuing another preference change */
  const settled = () => page.waitForFunction(() => !document.querySelector('fieldset[aria-busy="true"]'));
  /** Select a setting and wait for its completed persistence request */
  const select = async (name) => {
    await page.getByRole("button", { name, exact: true }).click();
    await settled();
  };
  await page.getByRole("group", { name: "外观选项" }).waitFor();
  await select("浅色");
  assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await select("跟随系统");
  await page.waitForFunction(() => document.documentElement.style.colorScheme === "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => document.documentElement.style.colorScheme === "light");
  await select("125%");
  assert.equal(await page.evaluate(() => document.documentElement.style.zoom), "1.25");
  await page.getByRole("button", { name: /Fluent 深色/ }).click();
  await settled();
  assert.equal(await page.getByRole("button", { name: "浅色", exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), "dark");
  await page.reload();
  await page.getByRole("group", { name: "外观选项" }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "glaze.theme.fluent-dark");
  assert.equal(await page.evaluate(() => document.documentElement.style.zoom), "1.25");
  await page.getByRole("checkbox", { name: "模拟写入失败" }).check();
  await select("90%");
  await page.getByRole("status").filter({ hasText: "外观保存失败" }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.style.zoom), "1.25");
  await page.getByRole("checkbox", { name: "模拟写入失败" }).uncheck();
  await select("110%");
  await select("切换页面");
  assert.equal(await page.getByRole("tab").count(), 6);
  assert.equal(await page.getByRole("button", { name: "调整默认显示的榜单" }).count(), 0);
  await page.evaluate(() => localStorage.setItem("fixture.layout", JSON.stringify(["pc_like"])));
  await select("切换页面");
  await select("恢复默认");
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("fixture.layout") ?? "[]").includes("pc_like")));
  await select("恢复默认");
  await page.getByRole("dialog").getByRole("button", { name: "恢复默认", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已恢复默认排版" }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.style.zoom), "1.1");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "glaze.theme.fluent-dark");
  await page.screenshot({ path: `${root}/node_modules/.cache/appearance-tests/appearance.png`, fullPage: true });
  await select("切换页面");
  assert.equal(await page.getByRole("tab").count(), 6);
  assert.deepEqual(errors, []);
  console.log("PASS: theme, OS mode, zoom, reload, failure/retry, all ranking tabs, reset/cancel and reset isolation");
} finally {
  await browser?.close();
  await server.close();
}
