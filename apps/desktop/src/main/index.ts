import { app } from "electron";
import { createServices } from "./bootstrap/services";
import { registerRpc } from "./ipc/rpc";
import { handleRemoteImages, registerRemoteImageScheme } from "./protocols/remote-image";
import { WindowLifecycle } from "./windows/lifecycle";
import { createMainWindow } from "./windows/main-window";

registerRemoteImageScheme();

let lifecycle: WindowLifecycle | undefined;

// A second launch, including Windows login startup, restores the existing window
if (process.argv.includes("--mcp")) {
  process.stderr.write("请在设置 → AI 接入开启 MCP 服务，并使用页面中的 HTTP 地址连接。\n");
  app.exit(1);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => lifecycle?.show());
  app.on("activate", () => lifecycle?.show());
  app.whenReady().then(() => {
    if (process.platform === "win32")
      app.setAppUserModelId(app.isPackaged ? "com.glaze.mcdevmanager" : process.execPath);
    handleRemoteImages();
    const services = createServices(
      () => {
        if (!lifecycle) throw new Error("窗口服务尚未就绪");
        lifecycle.ensureTray();
      },
      () => lifecycle?.show(),
    );
    lifecycle = new WindowLifecycle(() => services.general.preferences(), createMainWindow);
    registerRpc(
      services.sessions,
      services.appearance,
      services.general,
      services.cache,
      services.plugins,
      services.logs,
      services.sessionSettings,
      services.mcp,
      services.update,
      services.workArchive,
    );
    lifecycle.attach(createMainWindow());
    void services.mcp.start().catch(() => services.logs.write("error", "mcp", "MCP 服务启动失败"));
    services.update.start();
    app.on("before-quit", () => {
      services.update.stop();
      void services.mcp.stop();
    });
    // Check the saved session in the background; the window opens from saved state right away
    void services.sessions.restore();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
