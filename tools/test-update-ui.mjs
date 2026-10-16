import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// Settings → About update group against a scripted host: check, progress, restart-to-install, failure and switch
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
      "react-dom": join(root, "apps/desktop/node_modules/react-dom"),
      react: join(root, "apps/desktop/node_modules/react"),
    },
  },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.addInitScript(() => {
    const base = {
      phase: "idle",
      currentVersion: "0.1.0",
      latestVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      checkedAt: null,
      autoCheck: true,
    };
    const listeners = new Set();
    const host = { state: { ...base }, calls: [] };
    host.emit = (patch) => {
      host.state = { ...host.state, ...patch };
      for (const listener of listeners) listener(host.state);
    };
    globalThis.host = host;
    globalThis.glaze = {
      on: (event, listener) => {
        if (event !== "update.changed") return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      rpc: async (method, params) => {
        host.calls.push([method, params]);
        if (method === "update.state") return { ok: true, value: host.state };
        if (method === "update.check") {
          host.state = { ...host.state, phase: "downloading", latestVersion: "0.2.0", progress: 0 };
          host.state.releaseNotes = "新功能\n· 自动更新";
          return { ok: true, value: host.state };
        }
        if (method === "update.setAutoCheck") {
          host.state = { ...host.state, autoCheck: params.enabled };
          return { ok: true, value: host.state };
        }
        if (method === "app.getAbout") return { ok: false, error: { kind: "internal", message: "不在此测试范围" } };
        return { ok: true, value: undefined };
      },
    };
  });
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/license.html`);
  const group = page.getByRole("region", { name: "更新", exact: true });
  const calls = (method) => page.evaluate((m) => host.calls.filter(([name]) => name === m), method);

  await group.getByText("当前版本 v0.1.0", { exact: true }).waitFor();
  await group.getByText("启动后会自动检查", { exact: true }).waitFor();
  await group.getByRole("button", { name: "检查更新", exact: true }).click();
  await group.getByText("正在下载 v0.2.0 · 0%", { exact: true }).waitFor();
  assert.equal(await group.getByRole("button", { name: "检查中…", exact: true }).isDisabled(), true);

  await page.evaluate(() => host.emit({ progress: 0.42 }));
  await group.getByText("正在下载 v0.2.0 · 42%", { exact: true }).waitFor();
  assert.equal(await group.getByRole("progressbar").getAttribute("aria-valuenow"), "42");

  await page.evaluate(() => host.emit({ phase: "downloaded", progress: 1 }));
  await group.getByText("v0.2.0 已下载，重启应用即可完成安装", { exact: true }).waitFor();
  assert.equal(await group.getByRole("progressbar").count(), 0);
  await group.getByText("v0.2.0 更新说明", { exact: true }).click();
  assert.equal(await group.locator("details[open] pre").textContent(), "新功能\n· 自动更新");

  // Restarting needs confirmation; "稍后" keeps the app running
  await group.getByRole("button", { name: "重启并安装", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "重启并安装更新", exact: true });
  await dialog.getByText("应用会关闭并安装 v0.2.0，完成后自动重新打开。未保存的编辑内容会丢失。").waitFor();
  await dialog.getByRole("button", { name: "稍后", exact: true }).click();
  assert.equal(await dialog.count(), 0);
  assert.equal((await calls("update.install")).length, 0);
  await group.getByRole("button", { name: "重启并安装", exact: true }).click();
  await dialog.getByRole("button", { name: "立即重启", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal((await calls("update.install")).length, 1);
  await page.screenshot({ path: join(root, "node_modules/.cache/update-downloaded.png") });

  // Failures say what to do and offer the releases page
  await page.evaluate(() =>
    host.emit({ phase: "error", latestVersion: null, releaseNotes: null, error: "无法连接 GitHub，请检查网络后重试" }),
  );
  await group.getByText("无法连接 GitHub，请检查网络后重试", { exact: true }).waitFor();
  await group.getByRole("button", { name: "重试", exact: true }).waitFor();
  await group.getByRole("button", { name: "打开发布页", exact: true }).click();
  assert.deepEqual((await calls("app.openProjectLink")).at(-1), ["app.openProjectLink", { link: "releases" }]);

  // The automatic check switch saves through the host
  const autoCheck = group.getByRole("switch", { name: "自动检查更新", exact: true });
  assert.equal(await autoCheck.getAttribute("aria-checked"), "true");
  await autoCheck.click();
  await page.getByText("已关闭自动检查更新。", { exact: true }).waitFor();
  assert.equal(await autoCheck.getAttribute("aria-checked"), "false");
  assert.deepEqual((await calls("update.setAutoCheck")).at(-1), ["update.setAutoCheck", { enabled: false }]);

  // A development or portable copy points to the releases page instead of checking
  await page.evaluate(() => host.emit({ phase: "unsupported", error: null }));
  await group.getByText("开发模式或免安装版不能自动更新，可到发布页下载安装包", { exact: true }).waitFor();
  assert.equal(await group.getByRole("button", { name: "检查更新", exact: true }).count(), 0);
  await group.getByRole("button", { name: "打开发布页", exact: true }).waitFor();

  // Narrow windows keep the row and dialog inside the viewport
  await page.setViewportSize({ width: 600, height: 700 });
  assert.equal(await group.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: update check, progress, release notes, confirmed restart-to-install, failure guidance, releases link, auto-check switch, unsupported copy and narrow layout",
  );
} finally {
  await browser?.close();
  await server.close();
}
