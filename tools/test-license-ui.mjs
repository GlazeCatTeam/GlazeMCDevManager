import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectLicenseNotices } from "../apps/desktop/build/license-notices.ts";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const text = readFileSync(join(root, "LICENSE"), "utf8");
const notice = readFileSync(join(root, "NOTICE"), "utf8");
const licenses = collectLicenseNotices(join(root, "apps/desktop"));
const resources = licenses.filter((item) => item.name.startsWith("Minecraft 图标"));
assert.equal(resources.length, 2);
for (const resource of resources) {
  assert.notEqual(resource.license, "Apache-2.0");
  assert.equal(resource.notices[0].text, readFileSync(join(root, resource.notices[0].file), "utf8"));
}
const server = await createServer({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 0, hmr: false },
  resolve: {
    alias: {
      "react-dom": join(root, "apps/desktop/node_modules/react-dom"),
      react: join(root, "apps/desktop/node_modules/react"),
    },
  },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.addInitScript(
    ({ text, notice, licenses }) => {
      // Fail the first read: the dialog shares the about page's cached result, so it only sees a failure that happened
      globalThis.__failProject = true;
      globalThis.glaze = {
        on: () => () => {},
        rpc: async (method) => {
          if (method === "app.getAbout") {
            if (globalThis.__failProject) return { ok: false, error: { kind: "internal", message: "测试读取失败" } };
            return {
              ok: true,
              value: {
                name: "Glaze MC Dev Manager",
                version: "0.0.0",
                packaged: false,
                platform: "win32",
                arch: "x64",
                electron: "44.7.1",
                chromium: "152",
                node: "24",
                projectLicense: {
                  id: "Apache-2.0",
                  name: "Apache License 2.0",
                  summary: "原创代码与文档采用 Apache-2.0；第三方依赖与资源遵循各自声明。",
                  text,
                  notice,
                },
              },
            };
          }
          if (method === "app.getLicenses") return { ok: true, value: licenses };
          return { ok: true, value: undefined };
        },
      };
    },
    { text, notice, licenses },
  );
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/license.html`);
  await page.getByRole("button", { name: "查看许可", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "开源许可与第三方声明", exact: true });
  await dialog.getByText("读取项目许可失败：测试读取失败", { exact: true }).waitFor();
  await page.evaluate(() => {
    globalThis.__failProject = false;
  });
  await dialog.getByRole("button", { name: "重试项目许可", exact: true }).click();
  await page
    .getByText("原创代码与文档采用 Apache-2.0；第三方依赖与资源遵循各自声明。", { exact: true })
    .first()
    .waitFor();
  const project = dialog.getByRole("region", { name: "项目许可证", exact: true });
  await project.getByText("Apache-2.0 完整原文", { exact: true }).click();
  assert.equal(await project.locator("details[open] pre").textContent(), text);
  await project.getByText("Apache-2.0 完整原文", { exact: true }).click();
  await project.getByText("NOTICE · 版权与归属声明", { exact: true }).click();
  assert.equal(await project.locator("details[open] pre").textContent(), notice);
  await project.getByText("NOTICE · 版权与归属声明", { exact: true }).click();
  assert.equal(
    await dialog
      .locator("summary")
      .filter({ hasText: /Minecraft 图标/ })
      .count(),
    2,
  );
  await dialog.screenshot({ path: join(root, "node_modules/.cache/project-license.png") });
  await page.setViewportSize({ width: 960, height: 600 });
  await project.getByText("Apache-2.0 完整原文", { exact: true }).click();
  assert.equal(await dialog.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight), true);
  assert.equal(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: exact LICENSE/NOTICE source, independent Minecraft notices, offline project license UI, retry and small-window layout",
  );
} finally {
  await browser?.close();
  await server.close();
}
