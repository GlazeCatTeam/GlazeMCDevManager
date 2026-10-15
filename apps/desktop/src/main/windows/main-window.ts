import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { sendEvent } from "../ipc/rpc";

const windows = new Set<BrowserWindow>();

/** App windows that receive glaze:event pushes */
export function appWindows(): BrowserWindow[] {
  return [...windows];
}

/** Create the frameless main window with the security baseline from docs/architecture/10-security.md */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: "#2B2C2E",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  windows.add(win);
  win.on("closed", () => windows.delete(win));
  win.once("ready-to-show", () => win.show());

  // Keep the title bar's maximize button in sync
  const notifyState = () => sendEvent(win, "window.stateChanged", { maximized: win.isMaximized() });
  win.on("maximize", notifyState);
  win.on("unmaximize", notifyState);

  // Open external links in the system browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  const appUrl = devServerUrl ?? pathToFileURL(join(import.meta.dirname, "../renderer/index.html")).href;

  // Only the app's own page may load in the window; reloads (including dev full reloads) stay allowed
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url, appUrl)) {
      event.preventDefault();
    }
  });

  void win.loadURL(appUrl);

  return win;
}

/** Check that a navigation target is the app's own page, ignoring query and hash */
function isAppUrl(target: string, appUrl: string): boolean {
  try {
    const a = new URL(target);
    const b = new URL(appUrl);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}
