import { app, BrowserWindow } from "electron";
import { createServices } from "./bootstrap/services";
import { registerRpc } from "./ipc/rpc";
import { handleRemoteImages, registerRemoteImageScheme } from "./protocols/remote-image";
import { createMainWindow } from "./windows/main-window";

registerRemoteImageScheme();

app.whenReady().then(() => {
  handleRemoteImages();
  const { sessions } = createServices();
  registerRpc(sessions);
  createMainWindow();
  // Check the saved session in the background; the window opens from saved state right away
  void sessions.restore();

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
