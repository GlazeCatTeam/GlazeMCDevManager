import { join } from "node:path";
import type { EventName, EventPayloads } from "@glaze/contracts";
import { AccountStore, type Cipher, openDatabase, PreferenceStore, Vault } from "@glaze/storage";
import { app, safeStorage, session } from "electron";
import { sendEvent } from "../ipc/rpc";
import { LogService } from "../logs/service";
import { bundledPlugins, bundledThemes } from "../plugins/bundled";
import { PluginRegistry } from "../plugins/registry";
import { AppearanceService } from "../preferences/appearance";
import { CacheService } from "../preferences/cache";
import { GeneralService } from "../preferences/general";
import { readLoginItem, setLoginItem } from "../preferences/login-item";
import { SessionSettingsService } from "../preferences/session-settings";
import { clearRemoteImageCache } from "../protocols/remote-image";
import { ExpiryNotification } from "../session/expiry-notification";
import { SessionManager } from "../session/session-manager";
import { appWindows } from "../windows/main-window";

/** Windows DPAPI through Electron safeStorage; refuses to store anything when it is unavailable */
const dpapiCipher: Cipher = {
  encrypt(plain) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统加密不可用，无法安全保存登录信息");
    }
    return safeStorage.encryptString(plain);
  },
  decrypt(blob) {
    return safeStorage.decryptString(Buffer.from(blob));
  },
};

/** Push an event to every app window (never to the NetEase login window) */
function broadcast<E extends EventName>(event: E, payload: EventPayloads[E]): void {
  for (const win of appWindows()) {
    sendEvent(win, event, payload);
  }
}

/** Open the database and create the main-process services; call after app is ready */
export function createServices(ensureTray: () => void, showWindow: () => void) {
  const logs = new LogService(join(app.getPath("userData"), "logs"), () => broadcast("logs.changed", undefined));
  const db = openDatabase(join(app.getPath("userData"), "glaze.db"));
  const preferences = new PreferenceStore(db);
  const sessionSettings = new SessionSettingsService(preferences);
  const expiryNotification = new ExpiryNotification(showWindow, (message) => logs.write("warn", "account", message));
  const sessions = new SessionManager(
    new AccountStore(db),
    new Vault(db, dpapiCipher),
    {
      changed: (payload) => {
        logs.write("info", "account", "账号会话状态已更新");
        broadcast("account.changed", payload);
      },
      progress: (step) => broadcast("login.progress", { step }),
      expired: () => expiryNotification.show(),
    },
    () => sessionSettings.get(),
  );
  app.on("will-quit", () => db.close());
  const plugins = new PluginRegistry(
    preferences,
    join(app.getPath("userData"), "plugins"),
    bundledPlugins,
    bundledThemes,
    logs,
    () => broadcast("plugins.changed", plugins.snapshot()),
  );
  logs.write("info", "app", `应用启动，已发现 ${plugins.snapshot().plugins.length} 个插件与主题`);
  process.on("uncaughtExceptionMonitor", () => logs.write("error", "app", "主进程发生未捕获异常"));
  app.on("render-process-gone", () => logs.write("error", "renderer", "界面进程意外退出"));
  return {
    sessions,
    sessionSettings,
    logs,
    plugins,
    appearance: new AppearanceService(preferences, () => plugins.snapshot().themes),
    general: new GeneralService(preferences, { readLoginItem, setLoginItem, ensureTray }),
    cache: new CacheService(session.defaultSession, clearRemoteImageCache, () => broadcast("cache.cleared", undefined)),
  };
}
