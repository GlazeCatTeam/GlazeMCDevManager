import { app, BrowserWindow } from "electron";
import { registerRpc } from "./ipc/rpc";
import { createMainWindow } from "./windows/main-window";

app.whenReady().then(() => {
  registerRpc();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
