import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Use real windows, tray, SQLite, preload and cache APIs; stub Windows startup writes and all network traffic
const { _electron: electron } = await import(process.argv[2] ?? "playwright");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "glaze-general-electron-"));
const entry = join(directory, "launch.cjs");
const main = new URL("../apps/desktop/out/main/index.js", import.meta.url).href;
const root = fileURLToPath(new URL("../", import.meta.url));
writeFileSync(
  entry,
  `const { app, Tray, session, safeStorage, dialog } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
app.setPath('userData', ${JSON.stringify(directory)});
globalThis.fetch = async () => { throw new Error('Offline test'); };
globalThis.__shows = 0;
globalThis.__hides = 0;
globalThis.__cacheClears = 0;
globalThis.__unloadChoice = 0;
globalThis.__unloadPrompts = 0;
dialog.showMessageBoxSync = () => { globalThis.__unloadPrompts++; return globalThis.__unloadChoice; };
globalThis.__openDb = () => new DatabaseSync(join(app.getPath('userData'), 'glaze.db'));
try { globalThis.__login = JSON.parse(readFileSync(join(app.getPath('userData'), 'startup.json'), 'utf8')); } catch { globalThis.__login = null; }
app.getLoginItemSettings = () => {
  if (globalThis.__failRead) throw new Error('Test startup read failure');
  const item = globalThis.__login;
  return { openAtLogin: item?.openAtLogin ?? false, launchItems: item?.openAtLogin ? [{ ...item, scope: 'user' }] : [] };
};
app.setLoginItemSettings = (value) => {
  if (globalThis.__failWrite) throw new Error('Test startup write failure');
  globalThis.__login = value;
  writeFileSync(join(app.getPath('userData'), 'startup.json'), JSON.stringify(value));
};
const setMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function(menu) { globalThis.__tray = this; globalThis.__trayMenu = menu; return setMenu.call(this, menu); };
app.on('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.show = () => { globalThis.__shows++; };
  const hide = window.hide.bind(window);
  window.hide = () => { globalThis.__hides++; hide(); };
});
app.whenReady().then(() => {
  const clear = session.defaultSession.clearCache.bind(session.defaultSession);
  session.defaultSession.clearCache = async () => {
    globalThis.__cacheClears++;
    if (globalThis.__failCache) throw new Error('Test cache lock');
    await clear();
  };
});
import(${JSON.stringify(main)});
`,
);
let application;
try {
  /** Launch using the same temporary profile to exercise actual process restarts */
  const launch = async () => {
    application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root });
    const page = await application.firstWindow();
    page.setDefaultTimeout(10000);
    // Electron resolves beforeunload through its native prompt; suppress Playwright's competing auto-dismiss
    page.on("dialog", () => {});
    await page.waitForFunction(() => window.glaze && document.querySelector("button"));
    return page;
  };
  let page = await launch();
  /** Read the current settings after all pending UI writes finish */
  const settled = async () => {
    await page.waitForFunction(
      () => document.querySelector('[aria-label="启动与窗口选项"]')?.getAttribute("aria-busy") === "false",
    );
    return page.evaluate(() => window.glaze.rpc("general.get"));
  };
  /** Open settings through the actual unauthenticated navigation entry */
  const openGeneral = async () => {
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "通用", exact: true }).click();
    await settled();
  };
  await openGeneral();
  await page.getByRole("switch", { name: "开机自启" }).click();
  assert.equal((await settled()).value.settings.launchAtLogin, true);
  const launchItem = await application.evaluate(() => globalThis.__login);
  assert.equal(launchItem.name, "GlazeMCDevManager.Dev");
  assert.equal(launchItem.enabled, true);
  assert.match(launchItem.args[0], /^".*"$/);
  await page
    .getByRole("group", { name: "启动后打开", exact: true })
    .getByRole("button", { name: "作品管理", exact: true })
    .click();
  assert.equal((await settled()).value.settings.startPage, "works");

  await application.evaluate(() => {
    globalThis.__failWrite = true;
  });
  await page.getByRole("switch", { name: "开机自启" }).click();
  await settled();
  await page.getByRole("status").filter({ hasText: "保存通用设置失败" }).waitFor();
  assert.equal(await page.getByRole("switch", { name: "开机自启" }).getAttribute("aria-checked"), "true");
  await application.evaluate(() => {
    globalThis.__failWrite = false;
  });

  // Read failures disable writes until the user retries successfully
  await application.evaluate(() => {
    globalThis.__failRead = true;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "重新读取通用设置" }).waitFor();
  assert.equal(await page.getByRole("switch", { name: "开机自启" }).isDisabled(), true);
  await application.evaluate(() => {
    globalThis.__failRead = false;
  });
  await page.getByRole("button", { name: "重新读取通用设置" }).click();
  await settled();

  await application.evaluate(async ({ session }) => {
    await session.defaultSession.cookies.set({
      url: "https://cache-test.invalid",
      name: "keep-session",
      value: "fixture",
    });
  });
  await page.evaluate(() => localStorage.setItem("keep-draft", "unsaved fixture"));
  await page.getByRole("button", { name: "清除缓存", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
  assert.equal(await application.evaluate(() => globalThis.__cacheClears), 0);
  await page.getByRole("button", { name: "清除缓存", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "清除缓存" }).click();
  await page.getByRole("status").filter({ hasText: "缓存已清理" }).waitFor();
  assert.equal(
    await application.evaluate(
      async ({ session }) => (await session.defaultSession.cookies.get({ name: "keep-session" })).length,
    ),
    1,
  );
  assert.equal(await page.evaluate(() => localStorage.getItem("keep-draft")), "unsaved fixture");
  assert.equal((await page.evaluate(() => window.glaze.rpc("general.get"))).value.settings.startPage, "works");
  await application.evaluate(() => {
    globalThis.__failCache = true;
  });
  const partial = await page.evaluate(() => window.glaze.rpc("general.clearCache"));
  assert.ok(partial.value.warnings.length > 0);
  await application.evaluate(() => {
    globalThis.__failCache = false;
  });

  // Account management remains usable without an active account
  await page.getByRole("button", { name: "前往管理" }).click();
  await page.getByRole("heading", { name: "账号管理", exact: true }).waitFor();
  await openGeneral();
  mkdirSync(join(root, "node_modules/.cache/general-tests"), { recursive: true });
  const screenshot = await application.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
    return image.toPNG().toString("base64");
  });
  writeFileSync(join(root, "node_modules/.cache/general-tests/general.png"), Buffer.from(screenshot, "base64"));
  console.log("PASS: general settings UI, native failure recovery and cache isolation");

  // Seed only an isolated synthetic session; all network requests are blocked by the wrapper
  await application.evaluate(({ safeStorage }) => {
    const db = globalThis.__openDb();
    try {
      db.exec(
        "INSERT INTO accounts (id, nickname, login_method, last_login_at, status, is_current) VALUES ('fixture', '测试账号', 'cookie', 0, 'active', 1)",
      );
      db.prepare("INSERT INTO credentials VALUES (?, ?, ?)").run(
        "fixture",
        safeStorage.encryptString("offline-test-session"),
        Date.now(),
      );
    } finally {
      db.close();
    }
  });
  await application.close();
  application = null;
  page = await launch();
  await page.getByRole("heading", { name: "作品管理", exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.glaze.rpc("general.get"))).value.settings.launchAtLogin, true);
  await page.evaluate(() =>
    window.glaze.rpc("general.set", { launchAtLogin: true, startPage: "last", closeAction: "tray" }),
  );
  await page.evaluate(() => window.glaze.rpc("app.rememberRoute", { route: "glaze.messages/messages" }));
  await application.close();
  application = null;
  page = await launch();
  await page.getByRole("heading", { name: "消息中心", exact: true }).waitFor();
  console.log("PASS: startup page and last page across real process restarts");
  await page.evaluate(() => window.glaze.rpc("general.clearCache"));
  assert.equal(
    await application.evaluate(() => {
      const db = globalThis.__openDb();
      try {
        return db.prepare("SELECT COUNT(*) AS count FROM credentials").get().count;
      } finally {
        db.close();
      }
    }),
    1,
  );

  await page.evaluate(() => window.glaze.rpc("window.close"));
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  assert.equal(await application.evaluate(() => globalThis.__hides), 1);
  const shown = await application.evaluate(() => globalThis.__shows);
  await application.evaluate(() => globalThis.__tray.emit("click"));
  assert.equal(await application.evaluate(() => globalThis.__shows), shown + 1);
  await application.evaluate(({ app }) => app.emit("second-instance"));
  assert.equal(await application.evaluate(() => globalThis.__shows), shown + 2);
  await page.evaluate(() => {
    globalThis.__testBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", globalThis.__testBeforeUnload);
  });
  await application.evaluate(() => globalThis.__trayMenu.items.find((item) => item.label === "退出应用").click());
  await page.waitForTimeout(200);
  assert.equal(await application.evaluate(() => globalThis.__unloadPrompts), 1);
  await page.evaluate(() => window.glaze.rpc("window.close"));
  assert.equal(await application.evaluate(() => globalThis.__hides), 2);
  await page.evaluate(() => window.removeEventListener("beforeunload", globalThis.__testBeforeUnload));
  const trayClosed = application.waitForEvent("close");
  await application
    .evaluate(() => globalThis.__trayMenu.items.find((item) => item.label === "退出应用").click())
    .catch(() => {});
  await trayClosed;
  application = null;
  page = await launch();
  await page.evaluate(() =>
    window.glaze.rpc("general.set", { launchAtLogin: true, startPage: "last", closeAction: "quit" }),
  );
  await application.evaluate(() => {
    globalThis.__unloadChoice = 1;
  });
  await page.evaluate(() =>
    window.addEventListener("beforeunload", (event) => {
      event.preventDefault();
      event.returnValue = "";
    }),
  );
  const windowClosed = application.waitForEvent("close");
  await page.evaluate(() => window.glaze.rpc("window.close")).catch(() => {});
  await windowClosed;
  application = null;
  console.log(
    "PASS: general UI, mocked Windows registration, failure/retry, account navigation, real cache isolation, startup/last-page restart, tray restore and both quit paths",
  );
} finally {
  await application?.close();
  rmSync(directory, { recursive: true, force: true });
}
