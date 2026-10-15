import type { AvailableTheme, ThemeDefinition } from "@glaze/contracts";
import oreUi from "@glaze/theme-ore-ui/theme.json";
import { readPluginZip } from "./archive";

export interface ThemePluginPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  theme: AvailableTheme;
}

/** Only portable dotted identifiers are allowed in installed plugin directory names */
export function isPluginId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 100 &&
    /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(value) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(value)
  );
}

/** Restrict the initial package format to stable semantic versions */
export function isPluginVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value);
}

/** Validate display text before including package metadata in UI or logs */
function text(value: unknown, limit: number): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: reject control characters in package display metadata
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u001f]/.test(value))
    throw new Error("插件信息缺失或过长");
  return value;
}

/** Accept CSS token data, refusing resource loads, escapes, injected rules and unknown value types */
function tokens(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 400)
    throw new Error("主题令牌格式无效");
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9.-]{0,79}$/.test(key) ||
      key === "constructor" ||
      key === "prototype" ||
      typeof raw !== "string" ||
      raw.length > 300
    )
      throw new Error("主题令牌无效");
    const plain = raw.replace(/\{[a-zA-Z][a-zA-Z0-9.-]*\}/g, "");
    if (
      /[{};<>@\\\r\n]/.test(plain) ||
      /url\s*\(|image\s*\(|image-set\s*\(|expression\s*\(|\/\*|https?:|data:/i.test(plain)
    )
      throw new Error("主题只能包含无外部资源的样式令牌");
    result[key] = raw;
  }
  return result;
}

/** Bound reference depth and expanded token size before the theme resolver allocates strings */
function validateReferences(definition: ThemeDefinition, mode: string): void {
  const raw = {
    ...definition.tokens.base,
    ...definition.tokens.semantic,
    ...definition.tokens.component,
    ...definition.variants?.[mode],
  };
  const cache = new Map<string, string>();
  const resolve = (key: string, stack: Set<string>): string => {
    const saved = cache.get(key);
    if (saved !== undefined) return saved;
    const value = raw[key];
    if (value === undefined || stack.has(key) || stack.size > 32) throw new Error("主题包含缺失、循环或过深的令牌引用");
    stack.add(key);
    let length = value.length;
    const result = value.replace(/\{([^}]+)\}/g, (match, reference: string) => {
      const replacement = resolve(reference, stack);
      length += replacement.length - match.length;
      if (length > 4096) throw new Error("主题令牌展开结果过大");
      return replacement;
    });
    stack.delete(key);
    cache.set(key, result);
    return result;
  };
  for (const key of Object.keys(raw)) resolve(key, new Set());
}

/** Validate a no-code theme package and inherit complete base tokens from the built-in theme */
export function validateThemePackage(manifest: unknown, data: unknown): ThemePluginPackage {
  if (!manifest || typeof manifest !== "object" || !data || typeof data !== "object")
    throw new Error("插件清单或主题无效");
  const entry = manifest as Record<string, unknown>,
    theme = data as Record<string, unknown>;
  if (!isPluginId(entry.id) || entry.id.startsWith("glaze.") || !isPluginVersion(entry.version))
    throw new Error("插件 ID 或版本无效，不能覆盖内置插件");
  const engines = entry.engines as Record<string, unknown> | undefined;
  const contributes = entry.contributes as Record<string, unknown> | undefined;
  if (engines?.glaze !== "^0.1.0") throw new Error("插件需声明兼容 engines.glaze = ^0.1.0");
  if (
    entry.entries !== undefined ||
    (entry.permissions !== undefined && (!Array.isArray(entry.permissions) || entry.permissions.length !== 0)) ||
    !contributes ||
    Object.keys(contributes).some((key) => key !== "themes") ||
    !Array.isArray(contributes.themes) ||
    contributes.themes.length !== 1
  )
    throw new Error("当前仅支持无代码、无权限的单主题插件，尚不支持代码型第三方插件");
  const contribution = contributes.themes[0];
  if (
    !contribution ||
    contribution.id !== entry.id ||
    theme.id !== entry.id ||
    !["dark", "light"].includes(String(theme.defaultVariant))
  )
    throw new Error("主题 ID 或默认颜色模式无效");
  const layers = theme.tokens as Record<string, unknown> | undefined;
  if (!layers) throw new Error("主题缺少 tokens");
  const base = tokens(layers.base ?? {}),
    semantic = tokens(layers.semantic ?? {}),
    component = tokens(layers.component ?? {});
  const overrides = { ...base, ...semantic, ...component };
  const modes: ("dark" | "light")[] = [theme.defaultVariant as "dark" | "light"];
  const variants: Record<string, Record<string, string>> = {};
  if (theme.variants !== undefined) {
    if (!theme.variants || typeof theme.variants !== "object" || Array.isArray(theme.variants))
      throw new Error("主题变体格式无效");
    for (const [mode, values] of Object.entries(theme.variants)) {
      if (mode !== "dark" && mode !== "light") throw new Error("主题变体仅支持 dark 和 light");
      if (!modes.includes(mode)) modes.push(mode);
      variants[mode] = { ...(mode === "light" ? { ...oreUi.variants.light, ...overrides } : {}), ...tokens(values) };
    }
  }
  if (theme.defaultVariant === "light" && !variants.light) variants.light = { ...oreUi.variants.light, ...overrides };
  const name = text(entry.name, 80),
    description = entry.description === undefined ? "本地安装的主题包" : text(entry.description, 300);
  const definition: ThemeDefinition = {
    id: entry.id,
    name,
    defaultVariant: theme.defaultVariant as "dark" | "light",
    tokens: {
      base: { ...oreUi.tokens.base, ...base },
      semantic: { ...oreUi.tokens.semantic, ...semantic },
      component: { ...oreUi.tokens.component, ...component },
    },
    variants,
  };
  for (const mode of modes) validateReferences(definition, mode);
  return {
    id: entry.id,
    name,
    version: entry.version,
    description,
    theme: { id: entry.id, name, version: entry.version, description, modes, definition },
  };
}

/** Parse a package archive without extracting or executing any of its contents */
export function parseThemeArchive(bytes: Buffer): {
  manifest: unknown;
  definition: unknown;
  package: ThemePluginPackage;
} {
  const files = readPluginZip(bytes);
  const manifests = [...files.keys()].filter(
    (name) => name === "glaze-plugin.json" || name.endsWith("/glaze-plugin.json"),
  );
  if (manifests.length !== 1) throw new Error("插件包必须包含一个 glaze-plugin.json");
  const manifestPath = manifests[0];
  if (!manifestPath) throw new Error("缺少插件清单");
  const manifest = JSON.parse(files.get(manifestPath)?.toString("utf8") ?? "null");
  const themePath = manifest?.contributes?.themes?.[0]?.path;
  if (typeof themePath !== "string" || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.json$/.test(themePath))
    throw new Error("主题文件路径无效");
  const prefix = manifestPath.slice(0, -"glaze-plugin.json".length);
  const themeFile = `${prefix}${themePath}`;
  for (const name of files.keys())
    if (name !== manifestPath && name !== themeFile && !/\/(?:readme|license)(?:\.md|\.txt)?$/i.test(`/${name}`))
      throw new Error("主题包包含不支持的文件");
  const definition = JSON.parse(files.get(themeFile)?.toString("utf8") ?? "null");
  return { manifest, definition, package: validateThemePackage(manifest, definition) };
}
