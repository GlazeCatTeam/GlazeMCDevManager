import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { themeFixture } from "../tests/fixtures/theme-package.mjs";

const { _electron: electron } = await import(process.argv[2] ?? "playwright");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "glaze-plugin-ui-"));
const entry = join(directory, "launch.cjs"),
  archive = join(directory, "theme.glazeplugin"),
  exported = join(directory, "export.txt");
writeFileSync(archive, themeFixture().bytes);
writeFileSync(
  entry,
  `const { app, dialog, shell } = require('electron');
app.setPath('userData', ${JSON.stringify(directory)});
globalThis.fetch = async () => { throw new Error('Offline test'); };
globalThis.__cancelExport = true;
globalThis.__archive = ${JSON.stringify(archive)};
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [globalThis.__archive] });
dialog.showSaveDialog = async () => ({ canceled: globalThis.__cancelExport, filePath: ${JSON.stringify(exported)} });
shell.openPath = async (path) => { globalThis.__openedDirectory = path; return ''; };
app.on('browser-window-created', (_event, window) => { window.show = () => {}; window.webContents.setBackgroundThrottling(false); });
import(${JSON.stringify(new URL("../apps/desktop/out/main/index.js", import.meta.url).href)});
`,
);
let application;
try {
  /** Use a fresh process with the same isolated profile to verify persistent plugin state */
  const launch = async () => {
    application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root });
    const page = await application.firstWindow();
    page.setDefaultTimeout(10000);
    await page.getByRole("button", { name: "设置", exact: true }).waitFor();
    return page;
  };
  let page = await launch();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  /** Navigate to a settings category through production shell controls */
  const category = async (name) => {
    if (!(await page.getByRole("navigation", { name: "设置分类" }).count()))
      await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("navigation", { name: "设置分类" }).getByRole("button", { name, exact: true }).click();
  };
  await category("插件");
  const pluginState = await page.evaluate(() => window.glaze.rpc("plugins.list"));
  assert.ok(pluginState.value.plugins.some((item) => item.id === "glaze.works"));
  assert.equal(await page.getByRole("switch", { name: "启用设置", exact: true }).count(), 0);
  assert.equal(
    (await page.evaluate(() => window.glaze.rpc("plugins.setEnabled", { id: "glaze.settings", enabled: false }))).ok,
    false,
  );
  await page.getByRole("switch", { name: "启用作品管理", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="switch"][aria-label="启用作品管理"]')?.getAttribute("aria-checked") === "false",
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "功能导航" })
      .getByRole("button", { name: "作品管理", exact: true })
      .count(),
    0,
  );
  const denied = await page.evaluate(() => window.glaze.rpc("works.save", {}));
  assert.equal(denied.ok, false);
  assert.match(denied.error.message, /停用/);

  await page.getByRole("button", { name: "安装本地插件" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
  assert.equal(
    (await page.evaluate(() => window.glaze.rpc("plugins.list"))).value.plugins.some(
      (item) => item.id === "demo.ocean",
    ),
    false,
  );
  await page.getByRole("button", { name: "安装本地插件" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认安装" }).click();
  await page.getByRole("switch", { name: "启用海洋测试主题" }).waitFor();
  await category("外观");
  await page.getByRole("button", { name: /海洋测试主题/ }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "demo.ocean");
  assert.equal(
    await page.evaluate(() => document.documentElement.style.getPropertyValue("--g-surface-app")),
    "#234567",
  );
  await category("插件");
  await page.getByRole("switch", { name: "启用海洋测试主题" }).click();
  await page.getByRole("status").filter({ hasText: "请先在外观设置中切换主题" }).waitFor();
  await category("外观");
  await page.getByRole("button", { name: /Ore UI/ }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "glaze.theme.ore-ui");
  await category("插件");
  await page.getByRole("switch", { name: "启用海洋测试主题" }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="启用海洋测试主题"]')?.getAttribute("aria-checked") === "false",
  );
  await category("外观");
  assert.equal(await page.getByRole("button", { name: /海洋测试主题/ }).count(), 0);
  await application.close();
  application = null;
  page = await launch();
  await category("插件");
  assert.equal(await page.getByRole("switch", { name: "启用作品管理" }).getAttribute("aria-checked"), "false");
  assert.equal(await page.getByRole("switch", { name: "启用海洋测试主题" }).getAttribute("aria-checked"), "false");
  await page.getByRole("switch", { name: "启用海洋测试主题" }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="启用海洋测试主题"]')?.getAttribute("aria-checked") === "true",
  );
  await category("外观");
  await page.getByRole("button", { name: /海洋测试主题/ }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "demo.ocean");

  await page.evaluate(() => window.glaze.rpc("general.set", { launchAtLogin: "NTES_SESS=never-export-this" }));
  await category("日志");
  await page.waitForFunction(
    () => document.querySelector('[aria-label="运行日志记录"]')?.getAttribute("aria-busy") === "false",
  );
  assert.ok((await page.evaluate(() => window.glaze.rpc("logs.list", { level: "all" }))).value.entries.length > 0);
  await page.getByRole("group", { name: "日志级别" }).getByRole("button", { name: "错误", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="运行日志记录"]')?.getAttribute("aria-busy") === "false",
  );
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已取消导出" }).waitFor();
  await application.evaluate(() => {
    globalThis.__cancelExport = false;
  });
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "已导出" }).waitFor();
  const text = readFileSync(exported, "utf8");
  assert.match(text, /ERROR/);
  assert.doesNotMatch(text, /never-export-this|NTES_SESS|模拟日志/);
  await page.getByRole("button", { name: "打开文件夹" }).click();
  await page.getByRole("status").filter({ hasText: "已打开日志文件夹" }).waitFor();
  assert.equal(await application.evaluate(() => globalThis.__openedDirectory), join(directory, "logs"));
  const before = (await page.evaluate(() => window.glaze.rpc("logs.list", { level: "all" }))).value.entries.length;
  await page.getByRole("button", { name: "清除日志", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
  assert.equal(
    (await page.evaluate(() => window.glaze.rpc("logs.list", { level: "all" }))).value.entries.length,
    before,
  );
  const output = join(root, "node_modules/.cache/plugins-logs-tests");
  mkdirSync(output, { recursive: true });
  const screenshot = await application.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }))
      .toPNG()
      .toString("base64"),
  );
  writeFileSync(join(output, "logs.png"), Buffer.from(screenshot, "base64"));
  await page.getByRole("button", { name: "清除日志", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认清除" }).click();
  await page.getByRole("status").filter({ hasText: "本地运行日志已清除" }).waitFor();
  assert.equal((await page.evaluate(() => window.glaze.rpc("logs.list", { level: "all" }))).value.entries.length, 0);
  await application.close();
  application = null;
  page = await launch();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "demo.ocean");
  assert.ok((await page.evaluate(() => window.glaze.rpc("logs.list", { level: "all" }))).value.entries.length > 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real registry, disable/restart, protected modules, install/cancel, live themes, active-theme guard, log filter/export/cancel/clear, redaction and restart",
  );
} finally {
  await application?.close();
  rmSync(directory, { recursive: true, force: true });
}
