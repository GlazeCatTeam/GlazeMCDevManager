import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/promotion-tests`;
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/promotion.html?richDescriptions=1`);
  const content = page.locator("[data-activity-content]").first();
  await content.getByText("机械工业主题模组", { exact: true }).waitFor();
  assert.equal(await content.locator("br").count(), 3);
  assert.equal(await content.locator("ol > li").count(), 2);
  assert.equal(await content.locator("[style], [onclick], script, a").count(), 0);
  assert.match(await content.innerText(), /A & B，价格 < 100/);
  assert.doesNotMatch(await page.locator("main").innerText(), /<p>|<br>|<\/p>|unsafeActivity/);
  const excerpt = page
    .getByRole("button", { name: /秋日创作季/ })
    .first()
    .locator("p");
  assert.equal(await excerpt.locator("*").count(), 0);
  assert.match(await excerpt.innerText(), /机械纪元降临！ “机械工业”/);
  assert.equal(await content.locator("ol").evaluate((list) => getComputedStyle(list).listStyleType), "decimal");
  assert.equal(await content.evaluate((el) => getComputedStyle(el).fontSize), "13px");
  await content.click();
  assert.equal(await page.evaluate(() => document.body.dataset.unsafeActivity), undefined);
  await page.getByText("活动规则与说明", { exact: true }).click();
  await page.getByText("原创要求", { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/activity-content-dark.png` });
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await page.screenshot({ path: `${output}/activity-content-light.png` });
  await page.getByRole("button", { name: "折扣特卖", exact: true }).click();
  await page.locator("[data-activity-content]").first().getByText("机械工业主题模组", { exact: true }).waitFor();
  await page.getByText("特卖规则", { exact: true }).click();
  await page.getByText("原创要求", { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(), /<p>|<br>|<\/p>/);
  assert.equal(await page.locator("#writes").innerText(), "0");
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/promotion.html`);
  await page
    .locator("[data-activity-content]")
    .first()
    .getByText(/用方块搭建你的奇思妙想/)
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: HTML paragraphs, breaks, lists, entities, text-only card excerpts, theme typography, inactive markup, discount rules and plain text; no writes",
  );
} finally {
  await browser?.close();
  await server.close();
}
