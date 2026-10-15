import { join } from "node:path";
import type { EventName, EventPayloads } from "@glaze/contracts";
import { AccountStore, type Cipher, openDatabase, PreferenceStore, Vault } from "@glaze/storage";
import { app, safeStorage, session } from "electron";
import { sendEvent } from "../ipc/rpc";
import { AppearanceService } from "../preferences/appearance";
import { CacheService } from "../preferences/cache";
import { GeneralService } from "../preferences/general";
import { readLoginItem, setLoginItem } from "../preferences/login-item";
import { clearRemoteImageCache } from "../protocols/remote-image";
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
export function createServices(ensureTray: () => void) {
  const db = openDatabase(join(app.getPath("userData"), "glaze.db"));
  const sessions = new SessionManager(new AccountStore(db), new Vault(db, dpapiCipher), {
    changed: (payload) => broadcast("account.changed", payload),
    progress: (step) => broadcast("login.progress", { step }),
  });
  app.on("will-quit", () => db.close());
  const preferences = new PreferenceStore(db);
  return {
    sessions,
    appearance: new AppearanceService(preferences),
    general: new GeneralService(preferences, { readLoginItem, setLoginItem, ensureTray }),
    cache: new CacheService(session.defaultSession, clearRemoteImageCache, () => broadcast("cache.cleared", undefined)),
  };
}
