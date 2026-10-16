import { execFile } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpInstaller, McpInstallerId } from "@glaze/contracts";
import { McpError } from "@glaze/mcp";

// Server name written into every AI tool's configuration
const NAME = "glaze";

export interface Installer {
  id: McpInstallerId;
  name: string;
  target: string;
  file: string;
  detect(): Promise<boolean>;
  /** Write or replace the glaze entry; throws McpError with a user-facing reason */
  install(url: string): Promise<void>;
  /** Remove the glaze entry only when it still points at this key */
  uninstall(key: string): Promise<void>;
  /** Whether the configuration has this exact connection URL; null when it cannot be read */
  has(url: string): Promise<boolean | null>;
}

const home = homedir();
const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");

/** Back up the user's file once, then replace it atomically */
function writeConfig(file: string, text: string | Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file) && !existsSync(`${file}.glaze-backup`)) copyFileSync(file, `${file}.glaze-backup`);
  const temporary = `${file}.glaze-tmp`;
  writeFileSync(temporary, text, "utf8");
  renameSync(temporary, file);
}

/** Read strict JSON; files with comments are left for the user instead of being rewritten lossily */
function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    // Fall through to the user-facing error
  }
  throw new McpError("config", `无法自动修改 ${file}（文件含注释或格式不标准），请用「复制给 AI 的一句话」手动连接`);
}

/** Installer for tools whose config is a JSON object with one map of servers */
function jsonInstaller(
  id: McpInstallerId,
  name: string,
  file: string,
  marker: string,
  section: string,
  entry: (url: string) => Record<string, unknown>,
): Installer {
  return {
    id,
    name,
    target: file,
    file,
    detect: async () => existsSync(marker),
    install: async (url) => {
      const config = readJson(file);
      const servers = (config[section] && typeof config[section] === "object" ? config[section] : {}) as Record<
        string,
        unknown
      >;
      servers[NAME] = entry(url);
      config[section] = servers;
      writeConfig(file, `${JSON.stringify(config, null, 2)}\n`);
    },
    uninstall: async (key) => {
      if (!existsSync(file)) return;
      const config = readJson(file);
      const servers = config[section] as Record<string, unknown> | undefined;
      if (!servers || !JSON.stringify(servers[NAME] ?? "").includes(key)) return;
      delete servers[NAME];
      writeConfig(file, `${JSON.stringify(config, null, 2)}\n`);
    },
    has: async (url) => {
      try {
        const servers = readJson(file)[section] as Record<string, unknown> | undefined;
        const configured = servers?.[NAME];
        return (
          !!configured &&
          typeof configured === "object" &&
          Object.entries(entry(url)).every(([key, value]) => (configured as Record<string, unknown>)[key] === value)
        );
      } catch {
        return null;
      }
    },
  };
}

/** Remove [mcp_servers.glaze] and its subtables from TOML text */
export function withoutTomlServer(text: string, keep?: (block: string) => boolean): string {
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let block: string[] | null = null;
  const flush = () => {
    if (block && keep?.(block.join("\n"))) output.push(...block);
    block = null;
  };
  for (const line of lines) {
    const header = /^\s*\[/.test(line);
    if (header && /^\s*\[\s*mcp_servers\.(glaze|"glaze"|'glaze')\s*[.\]]/.test(line)) {
      // Subtables such as [mcp_servers.glaze.env] belong to the same server entry
      if (block) block.push(line);
      else block = [line];
    } else if (header) {
      flush();
      output.push(line);
    } else if (block) block.push(line);
    else output.push(line);
  }
  flush();
  return output.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Read only the main server table's URL, excluding similarly named servers and subtables */
function tomlServerUrl(text: string): string | null {
  let block = "";
  withoutTomlServer(text, (value) => {
    block = value
      .split(/^\s*\[/m)
      .slice(1, 2)
      .join("");
    return false;
  });
  const value = /^\s*url\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/m.exec(block)?.[1];
  if (!value) return null;
  return value.startsWith("'") ? value.slice(1, -1) : (JSON.parse(value) as string);
}

/** Build file-based installers with injectable paths and CLI discovery for isolated tests */
export function createInstallers(paths: {
  home: string;
  appData: string;
  codexHome?: string;
  claudeCli?: () => Promise<string | null>;
}): Installer[] {
  const { home, appData } = paths;
  const findClaude = paths.claudeCli ?? claudeCli;
  const codexFile = join(paths.codexHome ?? join(home, ".codex"), "config.toml");
  const codex: Installer = {
    id: "codex",
    name: "Codex",
    target: codexFile,
    file: codexFile,
    detect: async () => existsSync(dirname(codexFile)),
    install: async (url) => {
      const current = existsSync(codexFile) ? readFileSync(codexFile, "utf8") : "";
      const rest = withoutTomlServer(current).trimEnd();
      writeConfig(codexFile, `${rest ? `${rest}\n\n` : ""}[mcp_servers.${NAME}]\nurl = ${JSON.stringify(url)}\n`);
    },
    uninstall: async (key) => {
      if (!existsSync(codexFile)) return;
      const current = readFileSync(codexFile, "utf8");
      const next = withoutTomlServer(current, (block) => !block.includes(key));
      if (next !== current) writeConfig(codexFile, next);
    },
    has: async (url) => {
      if (!existsSync(codexFile)) return false;
      return tomlServerUrl(readFileSync(codexFile, "utf8")) === url;
    },
  };

  /** Run a command and return stdout, rejecting on non-zero exit */
  function run(file: string, args: string[]): Promise<string> {
    // npm shims are .cmd files that Windows can only start through cmd.exe; all arguments are URL-safe
    const shim = /\.(cmd|bat)$/i.test(file);
    return new Promise((resolve, reject) => {
      execFile(
        shim ? "cmd.exe" : file,
        shim ? ["/d", "/s", "/c", file, ...args] : args,
        { timeout: 20_000, windowsHide: true },
        (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
      );
    });
  }

  /** Newest claude.exe under a Claude desktop "claude-code/<version>/<build>/" folder */
  function bundledClaude(root: string): string | null {
    try {
      const versions = readdirSync(root)
        .filter((name) => /^\d+(\.\d+)*$/.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions)
        for (const build of readdirSync(join(root, version))) {
          const file = join(root, version, build, "claude.exe");
          if (existsSync(file)) return file;
        }
    } catch {
      // Folder missing or unreadable
    }
    return null;
  }

  /** Locate the Claude Code CLI from PATH, the native installer or the copy bundled with the Claude desktop app */
  async function claudeCli(): Promise<string | null> {
    try {
      const found = (await run("where.exe", ["claude"])).split(/\r?\n/).filter(Boolean);
      const path = found.find((entry) => /\.(exe|cmd)$/i.test(entry)) ?? found[0];
      if (path) return path;
    } catch {
      // Not on PATH
    }
    const native = join(home, ".local", "bin", "claude.exe");
    if (existsSync(native)) return native;
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    const packaged = (() => {
      try {
        return readdirSync(join(local, "Packages"))
          .filter((name) => name.startsWith("Claude_"))
          .map((name) => join(local, "Packages", name, "LocalCache", "Roaming", "Claude", "claude-code"));
      } catch {
        return [];
      }
    })();
    for (const root of [join(appData, "Claude", "claude-code"), ...packaged]) {
      const file = bundledClaude(root);
      if (file) return file;
    }
    return null;
  }

  const claudeFile = join(home, ".claude.json");
  const claudeJson = jsonInstaller("claude-code", "Claude Code", claudeFile, claudeFile, "mcpServers", (url) => ({
    type: "http",
    url,
  }));
  const claudeCode: Installer = {
    id: "claude-code",
    name: "Claude Code",
    target: "Claude Code 用户配置（所有项目可用）",
    file: claudeFile,
    detect: async () => existsSync(claudeFile) || existsSync(join(home, ".claude")) || !!(await findClaude()),
    install: async (url) => {
      const cli = await findClaude();
      // The CLI updates its own config safely even while Claude Code is running
      if (cli) {
        await run(cli, ["mcp", "remove", NAME, "--scope", "user"]).catch(() => undefined);
        try {
          await run(cli, ["mcp", "add", "--transport", "http", "--scope", "user", NAME, url]);
          return;
        } catch {
          // Fall back to editing the config file directly
        }
      }
      await claudeJson.install(url);
    },
    uninstall: async (key) => {
      if (!existsSync(claudeFile) || !readFileSync(claudeFile, "utf8").includes(key)) return;
      const cli = await findClaude();
      if (cli) await run(cli, ["mcp", "remove", NAME, "--scope", "user"]).catch(() => claudeJson.uninstall(key));
      else await claudeJson.uninstall(key);
    },
    has: (url) => claudeJson.has(url),
  };

  return [
    claudeCode,
    codex,
    jsonInstaller(
      "cursor",
      "Cursor",
      join(home, ".cursor", "mcp.json"),
      join(home, ".cursor"),
      "mcpServers",
      (url) => ({
        url,
      }),
    ),
    jsonInstaller(
      "vscode",
      "VS Code（Copilot）",
      join(appData, "Code", "User", "mcp.json"),
      join(appData, "Code", "User"),
      "servers",
      (url) => ({ type: "http", url }),
    ),
    jsonInstaller(
      "windsurf",
      "Windsurf",
      join(home, ".codeium", "windsurf", "mcp_config.json"),
      join(home, ".codeium", "windsurf"),
      "mcpServers",
      (url) => ({ serverUrl: url }),
    ),
    jsonInstaller(
      "gemini",
      "Gemini CLI",
      join(home, ".gemini", "settings.json"),
      join(home, ".gemini"),
      "mcpServers",
      (url) => ({ httpUrl: url }),
    ),
  ];
}

const installers = createInstallers({
  home,
  appData,
  codexHome: process.env.CODEX_HOME ?? join(home, ".codex"),
});

/** Report which AI tools appear to be installed on this computer */
export async function listInstallers(): Promise<McpInstaller[]> {
  const detected = await Promise.all(installers.map((entry) => entry.detect().catch(() => false)));
  return [
    ...installers.map((entry, index) => ({
      id: entry.id,
      name: entry.name,
      target: entry.target,
      detected: detected[index] ?? false,
    })),
    { id: "other", name: "其他 AI 工具", target: "复制一句话发给 AI，让它自己完成配置", detected: true },
  ];
}

/** Verify an install and restore its exact previous configuration if installation fails */
export async function installTool(
  id: McpInstallerId,
  url: string,
  entries: readonly Installer[] = installers,
): Promise<() => Promise<void>> {
  const installer = entries.find((entry) => entry.id === id);
  if (!installer) throw new McpError("validation", "不支持自动配置这个工具");
  const original = existsSync(installer.file) ? readFileSync(installer.file) : null;
  let written: Buffer | null | undefined;
  /** Restore the original bytes, or remove a configuration created by this attempt */
  const restore = async () => {
    const current = existsSync(installer.file) ? readFileSync(installer.file) : null;
    if (current === original || (current && original && current.equals(original))) return;
    if (written !== undefined && !(current === written || (current && written && current.equals(written))))
      throw new McpError(
        "config",
        `${installer.name} 的配置已被其他程序修改，为保留这些修改，请在 AI 助手中「重新写入」`,
      );
    if (original) {
      writeConfig(installer.file, original);
    } else rmSync(installer.file, { force: true });
  };
  try {
    await installer.install(url);
    written = existsSync(installer.file) ? readFileSync(installer.file) : null;
    if ((await installer.has(url)) !== true) throw new McpError("config", `${installer.name} 的连接地址未正确写入`);
    return restore;
  } catch (error) {
    try {
      await restore();
    } catch {
      throw new McpError("config", `写入 ${installer.name} 配置失败，原配置未能恢复；请在 AI 助手中点击「重新写入」`);
    }
    if (error instanceof McpError) throw error;
    throw new McpError("config", `写入 ${installer.name} 配置失败，请用「复制给 AI 的一句话」手动连接`);
  }
}

/** Check the complete target URL so a stale port cannot masquerade as a healthy configuration */
export async function checkTool(
  id: McpInstallerId,
  url: string,
  entries: readonly Installer[] = installers,
): Promise<boolean | null> {
  const installer = entries.find((entry) => entry.id === id);
  return installer ? installer.has(url).catch(() => null) : null;
}

/** Best-effort cleanup when the user removes a one-click connection */
export async function uninstallTool(id: McpInstallerId, key: string): Promise<void> {
  await installers
    .find((entry) => entry.id === id)
    ?.uninstall(key)
    .catch(() => undefined);
}

/** A sentence any AI tool can follow to configure the connection itself */
export function connectPrompt(url: string): string {
  return `请帮我添加一个 MCP 服务器：名称 glaze，传输方式 Streamable HTTP（http），地址 ${url} 。添加完成后告诉我是否需要重启，然后调用 glaze_status 工具确认已经连上 Glaze MC Dev Manager。`;
}
