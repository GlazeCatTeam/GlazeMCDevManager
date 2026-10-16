import { defaultUpdateAutoCheck, type UpdateState } from "@glaze/contracts";
import type { PreferenceStore } from "@glaze/storage";
import { CapabilityError } from "../ipc/errors";

interface ReleaseInfo {
  version: string;
  releaseNotes?: string | { note: string | null }[] | null;
}

/** The part of electron-updater's AppUpdater this service drives; tests pass a fake */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: "update-available" | "update-downloaded", listener: (info: ReleaseInfo) => void): unknown;
  on(event: "update-not-available", listener: () => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
}

export interface UpdateTimers {
  setTimeout(run: () => void, ms: number): unknown;
  setInterval(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const firstCheckDelay = 15_000;
const checkInterval = 6 * 60 * 60 * 1000;

/** Release notes from GitHub arrive as HTML; the settings page and AI read plain text */
function plainNotes(notes: ReleaseInfo["releaseNotes"]): string | null {
  const text = Array.isArray(notes) ? notes.map((entry) => entry.note ?? "").join("\n\n") : (notes ?? "");
  const plain = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "· ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return plain ? plain.slice(0, 4000) : null;
}

/** Turn updater failures into a sentence the user can act on; the raw message only goes to the log */
function describeFailure(error: Error): string {
  const message = error.message ?? "";
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|net::ERR_|socket|network/i.test(message))
    return "无法连接 GitHub，请检查网络后重试";
  if (/\b404\b|latest\.yml|Cannot find channel|No published versions/i.test(message))
    return "暂时没有可用的发布版本，请稍后再试";
  if (/sha512 checksum mismatch|signature/i.test(message)) return "下载的更新文件校验失败，已丢弃，请稍后重试";
  if (/ENOSPC/i.test(message)) return "磁盘空间不足，无法下载更新";
  return "检查更新失败，请稍后重试";
}

/**
 * Check GitHub Releases, download in the background and install on restart.
 * A null updater means this copy cannot update itself (development build or portable).
 */
export class UpdateService {
  private current: UpdateState;
  private pending: Promise<unknown> | null = null;
  private timers: unknown[] = [];

  constructor(
    private readonly store: PreferenceStore,
    private readonly updater: Updater | null,
    version: string,
    private readonly notify: (state: UpdateState) => void,
    private readonly log: (level: "info" | "warn" | "error", message: string) => void,
    private readonly clock: UpdateTimers = {
      setTimeout: (run, ms) => setTimeout(run, ms),
      setInterval: (run, ms) => setInterval(run, ms),
      clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
    },
  ) {
    this.current = {
      phase: updater ? "idle" : "unsupported",
      currentVersion: version,
      latestVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      checkedAt: null,
      autoCheck: this.savedAutoCheck(),
    };
    if (!updater) return;
    updater.autoDownload = true;
    // A downloaded update also installs when the user quits normally
    updater.autoInstallOnAppQuit = true;
    updater.on("update-available", (info) =>
      this.change({
        phase: "downloading",
        latestVersion: info.version,
        releaseNotes: plainNotes(info.releaseNotes),
        progress: 0,
        error: null,
      }),
    );
    updater.on("update-not-available", () =>
      this.change({ phase: "latest", latestVersion: null, releaseNotes: null, progress: null, error: null }),
    );
    updater.on("download-progress", ({ percent }) => {
      const progress = Math.max(0, Math.min(1, percent / 100));
      // Notify at whole percents so the renderer is not flooded
      if (Math.floor(progress * 100) !== Math.floor((this.current.progress ?? 0) * 100))
        this.change({ phase: "downloading", progress });
    });
    updater.on("update-downloaded", (info) => {
      this.log("info", `新版本 ${info.version} 已下载，重启后安装`);
      this.change({
        phase: "downloaded",
        latestVersion: info.version,
        releaseNotes: plainNotes(info.releaseNotes) ?? this.current.releaseNotes,
        progress: 1,
        error: null,
      });
    });
    updater.on("error", (error) => {
      this.log("warn", `更新失败：${error.message ?? "未知错误"}`);
      // A failure after the download finished does not take back an installable update
      if (this.current.phase === "downloaded") return;
      this.change({
        phase: "error",
        progress: null,
        error: describeFailure(error),
        checkedAt: new Date().toISOString(),
      });
    });
  }

  state(): UpdateState {
    return { ...this.current };
  }

  /** Check now; concurrent and repeated checks share one request, a downloaded update is kept */
  async check(): Promise<UpdateState> {
    const updater = this.updater;
    if (!updater || this.current.phase === "downloaded" || this.current.phase === "downloading") return this.state();
    if (!this.pending) {
      this.change({ phase: "checking", error: null });
      this.pending = updater
        .checkForUpdates()
        .then(
          () => {
            if (this.current.phase === "checking") this.change({ phase: "latest" });
          },
          (error: Error) => {
            // electron-updater normally also emits "error"; this covers a rejection without one
            if (this.current.phase === "checking") {
              this.log("warn", `更新失败：${error?.message ?? "未知错误"}`);
              this.change({ phase: "error", error: describeFailure(error ?? new Error("")) });
            }
          },
        )
        .finally(() => {
          this.pending = null;
          this.change({ checkedAt: new Date().toISOString() });
        });
    }
    await this.pending;
    return this.state();
  }

  /** Restart into the installer; only after a download finished */
  install(): undefined {
    if (!this.updater || this.current.phase !== "downloaded")
      throw new CapabilityError("validation", "更新还没有下载完成");
    this.log("info", `重启并安装新版本 ${this.current.latestVersion}`);
    // Silent install keeps the user's chosen directory, then reopens the app
    this.updater.quitAndInstall(true, true);
    return undefined;
  }

  setAutoCheck(enabled: unknown): UpdateState {
    if (typeof enabled !== "boolean") throw new CapabilityError("validation", "自动检查更新设置无效");
    this.store.set("update", { autoCheck: enabled });
    this.change({ autoCheck: enabled });
    this.schedule();
    return this.state();
  }

  /** Start background checks after launch when the user keeps automatic checking on */
  start(): void {
    this.schedule();
  }

  stop(): void {
    for (const handle of this.timers) this.clock.clear(handle);
    this.timers = [];
  }

  private schedule(): void {
    this.stop();
    if (!this.updater || !this.current.autoCheck) return;
    const run = () => void this.check();
    this.timers.push(this.clock.setTimeout(run, firstCheckDelay), this.clock.setInterval(run, checkInterval));
  }

  private savedAutoCheck(): boolean {
    const saved = this.store.get("update") as { autoCheck?: unknown } | undefined;
    return typeof saved?.autoCheck === "boolean" ? saved.autoCheck : defaultUpdateAutoCheck;
  }

  private change(patch: Partial<UpdateState>): void {
    this.current = { ...this.current, ...patch };
    this.notify(this.state());
  }
}
