import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { build, createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { _electron: electron } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/work-video-ui`;
mkdirSync(output, { recursive: true });
const csp = readFileSync(new URL("../apps/desktop/src/renderer/index.html", import.meta.url), "utf8").match(
  /content="(default-src[^"]+)"/,
)[1];
const server = await createServer({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [
    react(),
    {
      name: "production-media-csp",
      transformIndexHtml(html) {
        return html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0, hmr: false },
  resolve: {
    alias: {
      "react-dom": fileURLToPath(new URL("../apps/desktop/node_modules/react-dom", import.meta.url)),
      react: fileURLToPath(new URL("../apps/desktop/node_modules/react", import.meta.url)),
    },
  },
});
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: { entry: `${root}/tests/fixtures/work-video-main.ts`, formats: ["cjs"], fileName: () => "main.cjs" },
    rolldownOptions: { external: (id) => id.startsWith("node:") || id === "electron" },
  },
});
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
let app;
try {
  await server.listen();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: require("electron"),
    args: [
      `${output}/main.cjs`,
      `${server.resolvedUrls.local[0]}tests/fixtures/work-editor.html?editorFeatures=1&videoPreview=1`,
    ],
    env,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.waitForURL("**/work-editor.html?**", { timeout: 20000 });
  await page.getByRole("button", { name: "查看 猫咖啡测试专用 详情" }).click();
  await page.getByRole("tab", { name: "图片与视频", exact: true }).click();
  const video = page.getByLabel("作品视频预览");
  await video.waitFor();
  await video.scrollIntoViewIfNeeded();
  assert.equal(await page.getByRole("button", { name: "上传 / 替换视频", exact: true }).isDisabled(), true);
  assert.equal(
    await video.evaluate((v) => v.closest("fieldset[disabled]") === null && v.controls && !v.autoplay),
    true,
  );
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await video.click();
  await video.evaluate((v) => v.play());
  await page.waitForFunction(() => document.querySelector("video").currentTime > 0.2);
  await video.evaluate((v) => v.pause());
  assert.equal(await video.evaluate((v) => v.paused), true);
  await video.evaluate((v) => {
    v.currentTime = 0.8;
  });
  await page.waitForFunction(
    () => !document.querySelector("video").seeking && document.querySelector("video").currentTime >= 0.7,
  );
  await page.screenshot({ path: `${output}/playing.png` });
  await video.evaluate((v) => v.requestFullscreen());
  await page.waitForFunction(() => document.fullscreenElement?.tagName === "VIDEO");
  await page.evaluate(() => document.exitFullscreen());
  await app.evaluate(() => globalThis.videoTest.verifyTransport());
  await app.evaluate(() => globalThis.videoTest.fail(true));
  await video.evaluate((v) => {
    v.src += "&failure-check=1";
    v.load();
  });
  await page.getByRole("alert").filter({ hasText: "视频加载失败" }).waitFor();
  const retry = page.getByRole("button", { name: "重新加载视频", exact: true });
  assert.equal(await retry.isEnabled(), true);
  await app.evaluate(() => globalThis.videoTest.fail(false));
  await retry.click();
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  assert.equal(await retry.count(), 0);
  await page.getByRole("button", { name: "更新视频与封面", exact: true }).click();
  await page.getByRole("button", { name: "上传 / 替换视频", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("video")?.src.includes("fixture.mp4"));
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  assert.equal(
    await page.evaluate(() => workEditorFixture.requests.filter((r) => r.method === "works.save").length),
    0,
  );
  await video.evaluate((v) => v.play());
  await page.waitForFunction(() => document.querySelector("video").currentTime > 0.1);
  await video.evaluate((v) => v.pause());
  const section = page.locator("section").filter({ has: video });
  await section.getByRole("button", { name: "保存此分区", exact: true }).click();
  await page.getByText("此分区已保存到网易", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "上传 / 替换视频", exact: true }).isDisabled(), true);
  await video.evaluate((v) => v.play());
  await page.waitForFunction(() => document.querySelector("video").currentTime > 0.2);
  await page.setViewportSize({ width: 960, height: 720 });
  await video.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/narrow.png` });
  await page.getByRole("tab", { name: "基本信息", exact: true }).click();
  assert.equal(await page.locator("video").count(), 0);
  assert.deepEqual(errors, []);
  const result = await app.evaluate(() => ({
    mimeType: globalThis.videoTest.mimeType,
    ranges: globalThis.videoTest.requests,
  }));
  assert.ok(result.ranges.some((range) => range.startsWith("bytes=")));
  console.log(
    "PASS: Electron playback, pause, seek, fullscreen, locked preview, uploaded receipt, saved URL, retry, CSP, byte ranges and narrow layout",
    result.mimeType,
  );
} finally {
  await app?.close();
  await server.close();
}
