import { randomUUID } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  type AvailableTheme,
  capabilities,
  type InstalledPlugin,
  type PluginInstallPreview,
  type PluginSnapshot,
  type RpcMethod,
} from "@glaze/contracts";
import type { PreferenceStore } from "@glaze/storage";
import { ensureOwnedDirectory, ownedPath } from "../files/owned-directory";
import type { LogService } from "../logs/service";
import {
  isPluginId,
  isPluginVersion,
  parseThemeArchive,
  type ThemePluginPackage,
  validateThemePackage,
} from "./theme-package";

export interface BuiltinPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
}
type Candidate = ReturnType<typeof parseThemeArchive>;

/** Persistent registry for bundled modules and installed no-code theme packages */
export class PluginRegistry {
  private local = new Map<string, ThemePluginPackage>();
  private errors = new Map<string, string>();
  private versions = new Map<string, string>();
  private pending: { token: string; at: number; candidate: Candidate } | null = null;
  constructor(
    private readonly store: PreferenceStore,
    private readonly directory: string,
    private readonly builtins: BuiltinPlugin[],
    private readonly bundledThemes: AvailableTheme[],
    private readonly logs: LogService,
    private readonly changed: () => void,
  ) {
    this.scan();
  }

  /** Load only validated canonical JSON; installation paths and damaged records cannot execute code */
  private scan(): void {
    try {
      ensureOwnedDirectory(this.directory);
      for (const id of readdirSync(this.directory)) {
        if (!isPluginId(id) || id.startsWith("glaze.")) continue;
        try {
          const folder = ownedPath(this.directory, id);
          if (!statSync(folder).isDirectory()) continue;
          const versions = readdirSync(folder).filter(isPluginVersion).sort(compareVersions).reverse();
          const version = versions[0];
          if (!version) continue;
          this.versions.set(id, version);
          const file = ownedPath(this.directory, id, version, "package.json");
          if (statSync(file).size > 2 * 1024 * 1024) throw new Error("插件数据过大");
          const data = JSON.parse(readFileSync(file, "utf8"));
          const item = validateThemePackage(data.manifest, data.definition);
          if (item.id !== id || item.version !== version) throw new Error("插件目录与清单不匹配");
          this.local.set(id, item);
        } catch {
          this.errors.set(id, "本地主题包损坏或不兼容，请安装更高版本修复");
        }
      }
    } catch {
      this.logs.write("error", "plugins", "本地插件目录读取失败");
      this.errors.set("glaze.local-directory", "无法读取本地插件目录，请检查目录权限");
    }
  }

  /** Read valid saved switches; absent modules default to enabled */
  private switches(): Record<string, boolean> {
    const value = this.store.get("plugins.enabled");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([key, enabled]) => isPluginId(key) && typeof enabled === "boolean"),
    );
  }

  /** Return actual metadata and enabled themes, including unusable installed entries */
  snapshot(): PluginSnapshot {
    const switches = this.switches();
    const plugins: InstalledPlugin[] = this.builtins.map((plugin) => {
      const required = ["glaze.home", "glaze.account", "glaze.settings"].includes(plugin.id);
      return {
        ...plugin,
        required,
        enabled: required || switches[plugin.id] !== false,
        kind: "builtin",
        source: "bundled",
        error: null,
      };
    });
    for (const theme of this.bundledThemes)
      plugins.push({
        id: theme.definition.id,
        name: theme.name,
        version: theme.version,
        description: theme.description,
        required: true,
        enabled: true,
        kind: "theme",
        source: "bundled",
        error: null,
      });
    for (const item of this.local.values())
      plugins.push({
        id: item.id,
        name: item.name,
        version: item.version,
        description: item.description,
        required: false,
        enabled: switches[item.id] !== false,
        kind: "theme",
        source: "local",
        error: null,
      });
    for (const [id, error] of this.errors)
      plugins.push({
        id,
        name: id,
        version: "—",
        description: "本地主题包",
        required: false,
        enabled: false,
        kind: "theme",
        source: "local",
        error,
      });
    const themes = [
      ...this.bundledThemes,
      ...[...this.local.values()].filter((item) => switches[item.id] !== false).map((item) => item.theme),
    ];
    return { plugins, themes };
  }

  /** Disable optional modules only; a currently selected theme must be switched before disabling */
  setEnabled(id: unknown, enabled: unknown): PluginSnapshot {
    if (typeof id !== "string" || typeof enabled !== "boolean") throw new Error("插件状态参数无效");
    const plugin = this.snapshot().plugins.find((item) => item.id === id);
    if (!plugin || plugin.required || plugin.error) throw new Error("此插件不能更改启用状态");
    const appearance = this.store.get("appearance") as { themeId?: unknown } | undefined;
    if (!enabled && plugin.kind === "theme" && appearance?.themeId === id)
      throw new Error("请先在外观设置中切换主题，再停用当前主题");
    this.store.set("plugins.enabled", { ...this.switches(), [id]: enabled });
    this.logs.write("info", "plugins", `${enabled ? "启用" : "停用"}插件 ${id}`);
    this.changed();
    return this.snapshot();
  }

  /** Allow shared read capabilities while blocking writes belonging to disabled UI modules */
  assertMethodEnabled(method: string): void {
    const owner =
      method.startsWith("works.") && capabilities[method as RpcMethod]?.permission === "netease:works.write"
        ? "glaze.works"
        : ["comments.reply", "feedback.reply"].includes(method)
          ? "glaze.community"
          : ["messages.delete", "messages.markAllRead"].includes(method)
            ? "glaze.messages"
            : null;
    if (owner && !this.snapshot().plugins.find((plugin) => plugin.id === owner)?.enabled)
      throw new Error("对应插件已停用，请先启用再操作");
  }

  /** Validate a native-picked archive and issue a short-lived installation approval token */
  preview(bytes: Buffer): PluginInstallPreview {
    const candidate = parseThemeArchive(bytes);
    const previousVersion = this.versions.get(candidate.package.id) ?? null;
    if (previousVersion && compareVersions(candidate.package.version, previousVersion) <= 0)
      throw new Error("已安装相同或更高版本的主题");
    const appearance = this.store.get("appearance") as
      | { themeId?: string; colorMode?: "dark" | "light" | "system" }
      | undefined;
    if (
      appearance?.themeId === candidate.package.id &&
      appearance.colorMode &&
      (appearance.colorMode === "system"
        ? candidate.package.theme.modes.length < 2
        : !candidate.package.theme.modes.includes(appearance.colorMode))
    )
      throw new Error("新版本不支持当前颜色模式，请先切换到内置主题");
    const token = randomUUID();
    this.pending = { token, at: Date.now(), candidate };
    return {
      token,
      id: candidate.package.id,
      name: candidate.package.name,
      version: candidate.package.version,
      previousVersion,
      description: candidate.package.description,
    };
  }

  /** Write only canonical JSON after confirmation; publish each installation by atomic rename */
  install(token: unknown): PluginSnapshot {
    const pending = this.pending;
    this.pending = null;
    if (!pending || pending.token !== token || Date.now() - pending.at > 5 * 60_000)
      throw new Error("安装确认已过期，请重新选择插件包");
    const { candidate } = pending;
    const item = candidate.package;
    ensureOwnedDirectory(this.directory, item.id);
    const target = ownedPath(this.directory, item.id, item.version);
    if (existsSync(target)) throw new Error("此版本已存在，请提高版本号后重新安装");
    const stagingName = `staging-${randomUUID()}`;
    const staging = ensureOwnedDirectory(this.directory, item.id, stagingName);
    const temporary = ownedPath(this.directory, item.id, stagingName, "package.json");
    try {
      writeFileSync(temporary, JSON.stringify({ manifest: candidate.manifest, definition: candidate.definition }), {
        encoding: "utf8",
        flag: "wx",
      });
      renameSync(ownedPath(this.directory, item.id, stagingName), ownedPath(this.directory, item.id, item.version));
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(ownedPath(this.directory, item.id, stagingName, "package.json"));
      if (existsSync(staging)) rmdirSync(ownedPath(this.directory, item.id, stagingName));
      throw error;
    }
    this.local.set(item.id, item);
    this.versions.set(item.id, item.version);
    this.errors.delete(item.id);
    this.logs.write("info", "plugins", `安装主题 ${item.id} ${item.version}`);
    this.changed();
    return this.snapshot();
  }
}

/** Compare supported stable semantic versions numerically */
function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number),
    b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  return 0;
}
