import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Real Electron, preload, SQLite and DPAPI in an isolated profile; synthetic HTTP and native notification delivery
const { _electron: electron } = await import(process.argv[2] ?? "playwright");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "glaze-session-electron-"));
const entry = join(directory, "launch.cjs");
writeFileSync(
  entry,
  `
const { app, Notification, session } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const { join } = require('node:path');
app.setPath('userData', ${JSON.stringify(directory)});
globalThis.__openDb = () => new DatabaseSync(join(app.getPath('userData'), 'glaze.db'));
globalThis.__requests = [];
globalThis.__notifications = 0;
globalThis.__shows = 0;
globalThis.__expired = false;
globalThis.__unsupported = false;
globalThis.__notificationFailure = false;
globalThis.__nativeNotificationShow = Notification.prototype.show;
Notification.isSupported = () => !globalThis.__unsupported;
Notification.prototype.show = function() {
  globalThis.__notifications++;
  globalThis.__notification = this;
  if (globalThis.__notificationFailure) this.emit('failed', {}, 'synthetic failure');
};
Notification.prototype.close = function() {};
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname;
  globalThis.__requests.push(path);
  if (globalThis.__expired && (path === '/new_level/' || path === '/users/me')) return new Response('', { status: 401 });
  if (path === '/users/me') return Response.json({ status: 'ok', data: { nickname: '测试账号', level: 1, exp: 0 } });
  if (path === '/new_level/') return Response.json({ status: 'ok', data: {
    current_level: 2, current_class: 1, exp_floor: 0, exp_ceiling: 100, total_exp: 30,
    upgrade_class_achieve: false, contribution_month: '2026-09'
  } });
  return Response.json({ status: 'fixture', msg: 'Offline fixture' });
};
app.on('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.show = () => { globalThis.__shows++; };
  window.focus = () => {};
});
app.whenReady().then(() => session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  callback({ cancel: /^https?:/.test(details.url) });
}));
import(${JSON.stringify(new URL("../apps/desktop/out/main/index.js", import.meta.url).href)});
`,
);
let application;
try {
  /** Relaunch with one temporary profile to verify persisted preferences at process startup */
  const launch = async () => {
    application = await electron.launch({ executablePath: require("electron"), args: [entry], cwd: root });
    const page = await application.firstWindow();
    page.setDefaultTimeout(10000);
    await page.waitForFunction(() => window.glaze && document.querySelector("button"));
    return page;
  };
  let page = await launch();
  await page.getByRole("heading", { name: "登录开发者账号", exact: true }).waitFor();
  assert.deepEqual((await page.evaluate(() => window.glaze.rpc("sessionSettings.get"))).value, {
    autoLogin: true,
    notifyOnExpire: true,
  });
  await application.evaluate(({ safeStorage }) => {
    const db = globalThis.__openDb();
    try {
      db.exec(
        "INSERT INTO accounts (id, nickname, login_method, last_login_at, status, is_current) VALUES ('fixture', '测试账号', 'cookie', 0, 'active', 1)",
      );
      db.prepare("INSERT INTO credentials VALUES (?, ?, ?)").run(
        "fixture",
        safeStorage.encryptString("synthetic-session"),
        0,
      );
    } finally {
      db.close();
    }
  });
  assert.equal(
    (await page.evaluate(() => window.glaze.rpc("sessionSettings.set", { autoLogin: false, notifyOnExpire: true }))).ok,
    true,
  );
  await page.evaluate(() =>
    window.glaze.rpc("general.set", { launchAtLogin: false, startPage: "last", closeAction: "quit" }),
  );
  await page.evaluate(() => window.glaze.rpc("app.rememberRoute", { route: "glaze.account/account" }));
  await application.close();
  application = null;

  page = await launch();
  await page.getByRole("heading", { name: "登录开发者账号", exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.glaze.rpc("account.current"))).value, null);
  assert.deepEqual(await application.evaluate(() => globalThis.__requests), []);
  await page.getByRole("button", { name: "选择已保存账号", exact: true }).click();
  await page.getByRole("heading", { name: "账号管理", exact: true }).waitFor();
  const security = page.getByRole("region", { name: "会话与安全", exact: true });
  await security.getByRole("switch", { name: "启动时自动登录", exact: true }).waitFor();
  assert.equal(
    await security.getByRole("switch", { name: "启动时自动登录", exact: true }).getAttribute("aria-checked"),
    "false",
  );
  await page.getByRole("button", { name: "切换", exact: true }).click();
  await page.getByRole("region", { name: "开发者等级", exact: true }).getByText("Lv.2", { exact: true }).waitFor();

  /** Wait for the host-confirmed toggle value and completion of its IPC write */
  const toggle = async (name, expected) => {
    await page.getByRole("switch", { name, exact: true }).click();
    await page.waitForFunction(
      ({ name, expected }) => {
        const element = document.querySelector(`[role="switch"][aria-label="${name}"]`);
        return element?.getAttribute("aria-checked") === String(expected) && !element.disabled;
      },
      { name, expected },
    );
  };
  await toggle("启动时自动登录", true);
  await toggle("会话过期时提醒", false);
  assert.equal((await page.evaluate(() => window.glaze.rpc("account.current"))).value.id, "fixture");

  await application.evaluate(() => {
    const db = globalThis.__openDb();
    try {
      db.exec(
        "CREATE TRIGGER reject_session_update BEFORE UPDATE ON settings WHEN NEW.key = 'sessionSettings' BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END",
      );
    } finally {
      db.close();
    }
  });
  await security.getByRole("switch", { name: "启动时自动登录", exact: true }).click();
  await security.getByRole("button", { name: "重新读取", exact: true }).waitFor();
  assert.equal(
    await security.getByRole("switch", { name: "启动时自动登录", exact: true }).getAttribute("aria-checked"),
    "true",
  );
  await application.evaluate(() => {
    const db = globalThis.__openDb();
    try {
      db.exec("DROP TRIGGER reject_session_update");
    } finally {
      db.close();
    }
  });
  await security.getByRole("button", { name: "重新读取", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[role="switch"][aria-label="启动时自动登录"]').disabled);
  await application.close();
  application = null;

  page = await launch();
  await page.getByRole("heading", { name: "账号管理", exact: true }).waitFor();
  await page.getByText("Lv.2", { exact: true }).waitFor();
  assert.deepEqual((await page.evaluate(() => window.glaze.rpc("sessionSettings.get"))).value, {
    autoLogin: true,
    notifyOnExpire: false,
  });
  assert.ok((await application.evaluate(() => globalThis.__requests)).includes("/users/me"));
  assert.equal((await page.evaluate(() => window.glaze.rpc("account.current"))).value.id, "fixture");

  await application.evaluate(() => {
    globalThis.__expired = true;
  });
  await page
    .getByRole("region", { name: "开发者等级", exact: true })
    .getByRole("button", { name: "刷新", exact: true })
    .click();
  await page.getByText(/开发者等级加载失败/).waitFor();
  assert.equal((await page.evaluate(() => window.glaze.rpc("account.current"))).value.status, "expired");
  assert.equal(await application.evaluate(() => globalThis.__notifications), 0);
  await application.evaluate(() => {
    globalThis.__expired = false;
  });
  assert.equal((await page.evaluate(() => window.glaze.rpc("account.verify"))).ok, true);
  await toggle("会话过期时提醒", true);
  await application.evaluate(() => {
    globalThis.__expired = true;
  });
  const results = await page.evaluate(() =>
    Promise.all(Array.from({ length: 3 }, () => window.glaze.rpc("developer.level"))),
  );
  assert.ok(results.every((result) => !result.ok && result.error.kind === "session_expired"));
  assert.equal(await application.evaluate(() => globalThis.__notifications), 1);
  const shows = await application.evaluate(() => globalThis.__shows);
  await application.evaluate(() => globalThis.__notification.emit("click"));
  assert.equal(await application.evaluate(() => globalThis.__shows), shows + 1);

  // OS failures must not break expiry state or surface as successful login
  await application.evaluate(() => {
    globalThis.__expired = false;
    globalThis.__notificationFailure = true;
  });
  await page.evaluate(() => window.glaze.rpc("account.verify"));
  await application.evaluate(() => {
    globalThis.__expired = true;
  });
  assert.equal((await page.evaluate(() => window.glaze.rpc("developer.level"))).error.kind, "session_expired");
  const logs = await page.evaluate(() => window.glaze.rpc("logs.list", { level: "warn" }));
  assert.match(JSON.stringify(logs), /会话过期系统通知发送失败/);
  await application.evaluate(() => {
    globalThis.__expired = false;
  });
  await page.evaluate(() => window.glaze.rpc("account.verify"));
  await page
    .getByRole("region", { name: "开发者等级", exact: true })
    .getByRole("button", { name: "重试", exact: true })
    .click();
  await page.getByText("Lv.2", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "会话与安全", exact: true })
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
    true,
  );
  const screenshot = await application.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
    return image.toPNG().toString("base64");
  });
  writeFileSync(
    join(root, "node_modules/.cache/session-settings-tests/account-session.png"),
    Buffer.from(screenshot, "base64"),
  );
  if (process.argv.includes("--native-notification")) {
    const delivery = await application.evaluate(async ({ Notification }) => {
      const notification = new Notification({
        title: "Glaze 会话提醒测试",
        body: "这是一条功能验证通知，你的账号登录状态没有改变。",
      });
      globalThis.__nativeTestNotification = notification;
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve("no-delivery-event"), 5000);
        notification.once("show", () => {
          clearTimeout(timeout);
          resolve("shown");
        });
        notification.once("failed", () => {
          clearTimeout(timeout);
          resolve("failed");
        });
        globalThis.__nativeNotificationShow.call(notification);
      });
    });
    console.log(`Native test notification: ${delivery}`);
  }
  console.log(
    "PASS: real process restart, manual saved-account login, persisted switches, write rollback, expiry notification gating/dedup/click/failure and layout",
  );
} finally {
  await application?.close();
  const withinTemp = relative(tmpdir(), directory);
  assert.ok(withinTemp && !withinTemp.startsWith("..") && !isAbsolute(withinTemp), "Unexpected test cleanup target");
  rmSync(directory, { recursive: true, force: true });
}
