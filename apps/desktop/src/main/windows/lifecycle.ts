import type { GeneralSettings } from "@glaze/contracts";
import { app, type BrowserWindow, dialog, Menu, nativeImage, Tray } from "electron";

/** Small pixel-style app mark for the Windows notification area */
function trayIcon() {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 3; y < 29; y++) {
    for (let x = 3; x < 29; x++) {
      const offset = (y * size + x) * 4;
      const edge = x < 5 || x > 26 || y < 5 || y > 26;
      const color = edge ? [34, 45, 36] : y < 13 ? [67, 190, 91] : [54, 108, 58];
      pixels[offset] = color[2] ?? 0;
      pixels[offset + 1] = color[1] ?? 0;
      pixels[offset + 2] = color[0] ?? 0;
      pixels[offset + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size });
}

/** Own tray visibility and distinguish window closing from an explicit application quit */
export class WindowLifecycle {
  private tray: Tray | null = null;
  private quitting = false;
  private window: BrowserWindow | null = null;

  constructor(
    private readonly preferences: () => GeneralSettings,
    private readonly createWindow: () => BrowserWindow,
  ) {
    app.on("before-quit", () => {
      this.quitting = true;
    });
    app.on("will-quit", () => {
      this.tray?.destroy();
      this.tray = null;
    });
  }

  /** Create the tray before allowing a window to be hidden */
  ensureTray(): void {
    if (this.tray && !this.tray.isDestroyed()) return;
    const tray = new Tray(trayIcon());
    try {
      tray.setToolTip("Glaze MC Dev Manager");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "显示窗口", click: () => this.show() },
          { type: "separator" },
          { label: "退出应用", click: () => app.quit() },
        ]),
      );
      tray.on("click", () => this.show());
      tray.on("double-click", () => this.show());
      this.tray = tray;
    } catch (error) {
      tray.destroy();
      throw error;
    }
  }

  /** Restore a hidden or minimized window when the tray or a second launch activates it */
  show(): void {
    if (!this.window || this.window.isDestroyed()) this.attach(this.createWindow());
    const window = this.window;
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  /** Apply the latest saved close behavior to the main window */
  attach(window: BrowserWindow): void {
    this.window = window;
    window.webContents.on("will-prevent-unload", (event) => {
      const choice = dialog.showMessageBoxSync(window, {
        type: "warning",
        message: "当前页面有未保存的修改或尚未完成的操作",
        detail: "离开页面可能丢失修改。请选择留在页面，或确认放弃并继续。",
        buttons: ["留在页面", "放弃并继续"],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice === 1) event.preventDefault();
      else {
        this.quitting = false;
        this.show();
      }
    });
    window.on("close", (event) => {
      if (this.quitting) return;
      try {
        if (this.preferences().closeAction === "quit") {
          this.quitting = true;
          app.quit();
          return;
        }
        this.ensureTray();
        event.preventDefault();
        window.hide();
      } catch (error) {
        event.preventDefault();
        window.show();
        void dialog.showMessageBox(window, {
          type: "error",
          message: "无法最小化到托盘，窗口已保留",
          detail: error instanceof Error ? error.message : "请重试或选择退出应用",
        });
      }
    });
  }
}
