import { randomUUID } from "node:crypto";
import {
  isLoginWindowUrl,
  OFFICIAL_LOGIN_URL,
  PASSPORT_COOKIE,
  passportFromCookie,
  SESSION_COOKIE,
} from "@glaze/netease";
import { app, BrowserWindow, session } from "electron";
import { CapabilityError } from "../ipc/errors";

export interface WindowLogin {
  sessionCookie: string;
  passport: string | null;
}

// Give P_INFO and other cookies set in the same response a moment to land after NTES_SESS
const SETTLE_MS = 600;

let active: BrowserWindow | null = null;

/** Browser user agent without the Electron and app tokens, so NetEase serves its normal login page */
function browserUserAgent(): string {
  return app.userAgentFallback
    .split(" ")
    .filter((token) => !token.startsWith("Electron/") && !token.toLowerCase().startsWith("@glaze"))
    .join(" ");
}

/** Close the login window if one is open; the pending login fails as cancelled */
export function closeLoginWindow(): void {
  active?.close();
}

/**
 * Open NetEase's own developer-platform login page in an isolated, in-memory browser session.
 * The user signs in there (captcha and phone checks are NetEase's); the app never sees the password.
 * Resolves with the session cookie once NetEase sets it, rejects as "login_cancelled" if the window is closed
 */
export function loginWithOfficialWindow(parent: BrowserWindow | null): Promise<WindowLogin> {
  if (active) {
    active.focus();
    return Promise.reject(new CapabilityError("busy", "登录窗口已经打开"));
  }

  // A fresh, non-persistent partition per attempt: no cookies leak between attempts or accounts
  const partition = `login-${randomUUID()}`;
  const loginSession = session.fromPartition(partition, { cache: false });
  loginSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  const win = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: "登录网易我的世界开发者平台",
    autoHideMenuBar: true,
    backgroundColor: "#FFFFFF",
    ...(parent ? { parent } : {}),
    webPreferences: {
      partition,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  active = win;
  win.webContents.setUserAgent(browserUserAgent());

  // Only NetEase pages may load; popups to NetEase hosts open as child windows of the same session
  const guard = (event: Electron.Event, url: string) => {
    if (!isLoginWindowUrl(url)) {
      event.preventDefault();
    }
  };
  win.webContents.on("will-navigate", guard);
  win.webContents.on("will-redirect", guard);
  win.webContents.setWindowOpenHandler(({ url }) =>
    isLoginWindowUrl(url) ? { action: "allow", overrideBrowserWindowOptions: { parent: win } } : { action: "deny" },
  );

  return new Promise<WindowLogin>((resolve, reject) => {
    let settled = false;

    const finish = async (sessionCookie: string) => {
      if (settled) {
        return;
      }
      settled = true;
      await new Promise((done) => setTimeout(done, SETTLE_MS));
      const [passport] = await loginSession.cookies.get({ name: PASSPORT_COOKIE });
      resolve({ sessionCookie, passport: passportFromCookie(passport?.value) });
      win.close();
    };

    loginSession.cookies.on("changed", (_event, cookie, _cause, removed) => {
      const fromNetease = cookie.domain?.replace(/^\./, "").endsWith("163.com") ?? false;
      if (!removed && fromNetease && cookie.name === SESSION_COOKIE && cookie.value.length > 0) {
        void finish(cookie.value);
      }
    });

    win.on("closed", () => {
      active = null;
      void loginSession.clearStorageData();
      if (!settled) {
        settled = true;
        reject(new CapabilityError("login_cancelled", "已取消登录"));
      }
    });

    void win.loadURL(OFFICIAL_LOGIN_URL);
  });
}
