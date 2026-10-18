import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/work-shelf-ui`;
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
    const scenario = new URLSearchParams(location.search).get("shelf") ?? "detail";
    globalThis.shelfFixture = { detail: true, reads: 0, list: scenario !== "detail" };
    let bridge;
    Object.defineProperty(globalThis, "glaze", {
      configurable: true,
      get: () => bridge,
      set: (value) => {
        const original = value.rpc;
        value.rpc = async (method, params) => {
          const result = await original(method, params);
          if (result.ok && ["works.list", "works.page"].includes(method)) {
            const items = method === "works.list" ? result.value : result.value.items;
            for (const item of items) item.weakOffline = shelfFixture.list;
          }
          if (method === "works.get") {
            shelfFixture.reads++;
            if (scenario === "error") return { ok: false, error: { kind: "network", message: "模拟详情失败" } };
            if (result.ok && scenario !== "legacy") result.value.weakOffline = shelfFixture.detail;
          }
          return result;
        };
        bridge = value;
      },
    });
  });
  const url = `${server.resolvedUrls.local[0]}tests/fixtures/work-editor.html?actions=1`;
  const card = () =>
    page
      .getByRole("list", { name: "作品", exact: true })
      .getByRole("listitem")
      .filter({ has: page.getByText("审核中的测试作品", { exact: true }) });
  const tag = () => card().getByText("弱下架", { exact: true });
  await page.goto(url);
  await tag().waitFor();
  assert.equal(
    await tag().evaluate((node) => node.previousElementSibling?.textContent),
    "PE",
    "weak-offline tag immediately follows the platform tag",
  );
  assert.equal(
    await page.evaluate(() => workActionFixture.requests.filter((r) => r.method === "works.editor").length),
    0,
    "shelf state reuses cover details without loading full editors",
  );
  await page.screenshot({ path: `${output}/list.png`, fullPage: true });
  await page.evaluate(() => {
    shelfFixture.detail = false;
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await tag().waitFor({ state: "hidden" });
  await page.evaluate(() => {
    shelfFixture.detail = true;
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await tag().waitFor();
  await card().getByRole("button", { name: "归档 审核中的测试作品", exact: true }).click();
  await card().waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "归档管理", exact: true }).click();
  await tag().waitFor();
  for (const width of [1360, 1100]) {
    await page.setViewportSize({ width, height: 1050 });
    const platform = await card().getByText("PE", { exact: true }).boundingBox();
    const weak = await tag().boundingBox();
    assert.ok(platform && weak && weak.x > platform.x && Math.abs(weak.y - platform.y) < 1);
  }
  await page.screenshot({ path: `${output}/archive.png`, fullPage: true });
  await page.evaluate(() => localStorage.clear());
  for (const scenario of ["legacy", "error"]) {
    await page.goto(`${url}&shelf=${scenario}`);
    await tag().waitFor();
    await page.waitForFunction(() => shelfFixture.reads >= 9);
    assert.equal(await tag().count(), 1, `${scenario} details preserve the list state`);
  }
  await page.goto(`${url}&shelf=stale`);
  await tag().waitFor();
  await page.evaluate(() => {
    shelfFixture.detail = false;
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await tag().waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log("✔ 弱下架标签：详情补全、PE 右侧位置、刷新、归档、旧详情及读取失败回退");
} finally {
  await browser?.close();
  await server.close();
}
