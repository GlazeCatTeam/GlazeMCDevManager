import { app } from "electron";
import electronUpdater from "electron-updater";
import type { Updater } from "./service";

/** The installed NSIS build updates itself from GitHub Releases; development and portable copies cannot */
export function createUpdater(): Updater | null {
  if (!app.isPackaged || process.platform !== "win32" || process.env.PORTABLE_EXECUTABLE_DIR) return null;
  const { autoUpdater } = electronUpdater;
  // The service writes its own redacted log lines; the library logger would print raw URLs and paths
  autoUpdater.logger = null;
  // AppUpdater's typed emitter is wider than the events the service listens to
  return autoUpdater as unknown as Updater;
}
