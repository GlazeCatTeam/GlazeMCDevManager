import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { sendEvent } from "../ipc/rpc";

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
  win.webContents.on("will-navigate", (event) => event.preventDefault());

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }

  return win;
}
