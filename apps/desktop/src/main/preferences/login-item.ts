import { app } from "electron";
import type { LoginItemState } from "./general";

/** Keep the app's startup registration separate from other Electron development projects */
function loginItemOptions() {
  return {
    name: app.isPackaged ? "GlazeMCDevManager" : "GlazeMCDevManager.Dev",
    path: process.execPath,
    args: app.isPackaged ? [] : [`"${app.getAppPath()}"`],
  };
}

/** Read this application's registration and its Windows startup approval state */
export function readLoginItem(): LoginItemState {
  if (process.platform !== "win32") return { supported: false, enabled: false, warning: "开机自启目前仅支持 Windows" };
  const options = loginItemOptions();
  const state = app.getLoginItemSettings(options);
  const own = state.launchItems.find((item) => item.name === options.name && item.scope === "user");
  const enabled = state.openAtLogin && own?.enabled === true;
  return {
    supported: true,
    enabled,
    warning: state.openAtLogin && !enabled ? "此启动项已被 Windows 禁用，可重新开启或在系统启动应用中检查" : null,
  };
}

/** Register the installed executable, or the explicit project path in development */
export function setLoginItem(enabled: boolean): void {
  if (process.platform !== "win32") throw new Error("开机自启目前仅支持 Windows");
  app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: enabled, enabled });
}
