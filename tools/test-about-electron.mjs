import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Exercise the built application and real IPC in a separate profile, with browser opening and network stubbed
const { _electron: electron } = await import(process.argv[2] ?? "playwright");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(root, "node_modules/.cache/about-test-"));
const entry = join(directory, "launch.cjs");
const manifest = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8"));
writeFileSync(
  entry,
  `
const { app, shell, session } = require('electron');
app.setPath('userData', ${JSON.stringify(directory)});
globalThis.__opened = [];
globalThis.__openFailure = false;
globalThis.__runtimeFailure = false;
shell.openExternal = async (url) => {
  if (globalThis.__openFailure) throw new Error('synthetic browser failure');
  globalThis.__opened.push(url);
};
shell.openPath = async (path) => {
  if (globalThis.__runtimeFailure) return 'synthetic file failure';
  globalThis.__opened.push(path);
  return '';
};
globalThis.fetch = async (url) => {
  if (new URL(url).pathname === '/users/me') return Response.json({status:'ok',data:{nickname:'关于页面测试',level:1,exp:0}});
  return Response.json({status:'fixture',msg:'Offline fixture'});
};
app.on('browser-window-created', (_event, win) => {
  win.show = () => {};
  win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
});
app.whenReady().then(() => session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({cancel:/^https?:/.test(details.url)})));
import(${JSON.stringify(new URL("../apps/desktop/out/main/index.js", import.meta.url).href)});
`,
);
let application;
try {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root, env });
  const page = await application.firstWindow();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => window.glaze && document.querySelector("button"));
  const about = await page.evaluate(() => window.glaze.rpc("app.getAbout"));
  assert.equal(about.ok, true);
  assert.equal(about.value.version, manifest.version);
  assert.equal(about.value.packaged, false);
  const licenseText = readFileSync(join(root, "LICENSE"), "utf8");
  const noticeText = readFileSync(join(root, "NOTICE"), "utf8");
  assert.equal(about.value.projectLicense.id, "Apache-2.0");
  assert.equal(about.value.projectLicense.text, licenseText);
  assert.equal(about.value.projectLicense.notice, noticeText);
  assert.equal(readFileSync(join(root, "apps/desktop/out/main/LICENSE"), "utf8"), licenseText);
  assert.equal(readFileSync(join(root, "apps/desktop/out/main/NOTICE"), "utf8"), noticeText);
  assert.match(about.value.electron, /^\d+\./);
  assert.match(about.value.chromium, /^\d+\./);
  assert.match(about.value.node, /^\d+\./);
  const licenses = await page.evaluate(() => window.glaze.rpc("app.getLicenses"));
  assert.equal(licenses.ok, true);
  for (const name of ["react", "react-dom", "scheduler", "electron"]) {
    const item = licenses.value.find((item) => item.name === name);
    assert.ok(item, `Missing ${name} notice`);
    assert.ok(item.notices.some((entry) => entry.text.includes("Copyright")));
  }
  assert.ok(!JSON.stringify(licenses.value).includes(root));
  const resources = licenses.value.filter((item) => item.name.startsWith("Minecraft 图标"));
  assert.equal(resources.length, 2);
  for (const resource of resources) {
    assert.notEqual(resource.license, "Apache-2.0");
    assert.match(resource.notices[0].text, /Mojang AB/);
    assert.equal(resource.notices[0].text, readFileSync(join(root, resource.notices[0].file), "utf8"));
  }
  for (const link of [
    null,
    {},
    "__proto__",
    "toString",
    "https://example.com",
    "file:///C:/Windows",
    "javascript:alert(1)",
  ]) {
    const result = await page.evaluate((link) => window.glaze.rpc("app.openProjectLink", { link }), link);
    assert.equal(result.ok, false);
    assert.equal(result.error.kind, "validation");
  }
  assert.deepEqual(await application.evaluate(() => globalThis.__opened), []);

  // Also verify that windows without the trusted main-window identity cannot invoke native actions
  const rejected = await application.evaluate(async ({ BrowserWindow, ipcMain }) => {
    const other = new BrowserWindow({ show: false });
    try {
      const invoke = ipcMain._invokeHandlers.get("glaze:rpc");
      return await invoke(
        { sender: other.webContents, senderFrame: other.webContents.mainFrame },
        { method: "app.openProjectLink", params: { link: "homepage" } },
      );
    } finally {
      other.destroy();
    }
  });
  assert.equal(rejected.ok, false);

  const login = await page.evaluate(() =>
    window.glaze.rpc("account.loginWithCookie", { cookie: "NTES_SESS=about-offline-fixture" }),
  );
  assert.equal(login.ok, true, JSON.stringify(login));
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "关于", exact: true }).click();
  await page.getByText(`v${manifest.version} · 开发模式`, { exact: true }).waitFor();
  assert.match(await page.getByLabel("运行环境").innerText(), new RegExp(about.value.electron.replaceAll(".", "\\.")));
  for (const name of ["查看主页", "提交反馈", "查看项目"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByText("已在默认浏览器中打开链接。", { exact: true }).waitFor();
  }
  assert.deepEqual(await application.evaluate(() => globalThis.__opened), [
    "https://github.com/GlazeCatTeam/GlazeMCDevManager",
    "https://github.com/GlazeCatTeam/GlazeMCDevManager/issues",
    "https://github.com/BitterLemonn/MCDevManager",
  ]);
  await application.evaluate(() => {
    globalThis.__openFailure = true;
  });
  await page.getByRole("button", { name: "查看主页", exact: true }).click();
  await page.getByText(/无法打开默认浏览器/).waitFor();
  await application.evaluate(() => {
    globalThis.__openFailure = false;
  });

  // Inject recoverable read errors at the IPC boundary without changing production code
  await application.evaluate(({ ipcMain }) => {
    const handler = ipcMain._invokeHandlers.get("glaze:rpc");
    ipcMain.removeHandler("glaze:rpc");
    ipcMain.handle("glaze:rpc", (event, request) => {
      if (globalThis.__failRead === request.method)
        return { ok: false, error: { kind: "internal", message: "离线读取失败" } };
      return handler(event, request);
    });
    globalThis.__failRead = "app.getAbout";
  });
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByRole("button", { name: "关于", exact: true }).click();
  await page.getByText("版本信息读取失败：离线读取失败", { exact: true }).waitFor();
  await application.evaluate(() => {
    globalThis.__failRead = "";
  });
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByText(`v${manifest.version} · 开发模式`, { exact: true }).waitFor();

  await application.evaluate(() => {
    globalThis.__failRead = "app.getLicenses";
  });
  await page.getByRole("button", { name: "查看许可", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "开源许可与第三方声明", exact: true });
  await dialog.getByText("读取许可失败：离线读取失败", { exact: true }).waitFor();
  await application.evaluate(() => {
    globalThis.__failRead = "";
  });
  await dialog.getByRole("button", { name: "重试", exact: true }).click();
  const project = dialog.getByRole("region", { name: "项目许可证", exact: true });
  await project.getByRole("heading", { name: "Apache License 2.0", exact: true }).waitFor();
  await project.getByText("Apache-2.0 完整原文", { exact: true }).click();
  assert.equal(await project.locator("details[open] pre").textContent(), licenseText);
  await project.getByText("Apache-2.0 完整原文", { exact: true }).click();
  await project.getByText("NOTICE · 版权与归属声明", { exact: true }).click();
  assert.equal(await project.locator("details[open] pre").textContent(), noticeText);
  await project.getByText("NOTICE · 版权与归属声明", { exact: true }).click();
  await dialog
    .locator("summary")
    .filter({ hasText: /^react ·/ })
    .click();
  await dialog
    .locator("details[open] pre")
    .filter({ hasText: /Permission is hereby granted/ })
    .waitFor();
  await dialog.getByRole("button", { name: "查看运行时第三方声明", exact: true }).click();
  await dialog.getByText("已打开运行时第三方许可声明。", { exact: true }).waitFor();
  const opened = await application.evaluate(() => globalThis.__opened);
  assert.ok(opened.at(-1).endsWith("LICENSES.chromium.html"));
  await application.evaluate(() => {
    globalThis.__runtimeFailure = true;
  });
  await dialog.getByRole("button", { name: "查看运行时第三方声明", exact: true }).click();
  await dialog.getByText(/无法打开运行时许可声明/).waitFor();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 600));
  assert.equal(await dialog.evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight), true);
  /** Capture hidden Electron windows without Playwright waiting for a visible compositor frame */
  const capture = async (name) => {
    const png = await application.evaluate(async ({ BrowserWindow }) => {
      const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      return image.toPNG().toString("base64");
    });
    writeFileSync(join(directory, name), Buffer.from(png, "base64"));
  };
  await capture("licenses.png");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  // A development build cannot update itself and points to the releases page instead
  await page.getByText("开发模式或免安装版不能自动更新，可到发布页下载安装包", { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.glaze.rpc("update.check"))).value.phase, "unsupported");
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
  await page.getByRole("region", { name: "关于设置", exact: true }).evaluate((element) => {
    for (const child of element.querySelectorAll("div")) child.scrollTop = 0;
  });
  await capture("about.png");
  assert.deepEqual(errors, []);
  console.log(
    `PASS: project license/NOTICE match source and build output, separate Minecraft notices, real metadata, trusted callers, fixed destinations, native errors, UI retry, offline licenses and short-window layout. Screenshots: ${directory}`,
  );
} finally {
  await application?.close();
}
