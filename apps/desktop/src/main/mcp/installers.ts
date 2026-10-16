import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpInstaller, McpInstallerId } from "@glaze/contracts";
import { McpError } from "@glaze/mcp";

// Server name written into every AI tool's configuration
const NAME = "glaze";

interface Installer {
  id: McpInstallerId;
  name: string;
  target: string;
  detect(): Promise<boolean>;
  /** Write or replace the glaze entry; throws McpError with a user-facing reason */
  install(url: string): Promise<void>;
  /** Remove the glaze entry only when it still points at this key */
  uninstall(key: string): Promise<void>;
}

const home = homedir();
const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");

/** Back up the user's file once, then replace it atomically */
function writeConfig(file: string, text: string): void {
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
    if (header && /^\s*\[\s*mcp_servers\.(glaze|"glaze")\s*[.\]]/.test(line)) {
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

const codexFile = join(process.env.CODEX_HOME ?? join(home, ".codex"), "config.toml");
const codex: Installer = {
  id: "codex",
  name: "Codex",
  target: codexFile,
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

/** Locate the Claude Code CLI from PATH or the native installer's default folder */
async function claudeCli(): Promise<string | null> {
  try {
    const found = (await run("where.exe", ["claude"])).split(/\r?\n/).filter(Boolean);
    return found.find((path) => /\.(exe|cmd)$/i.test(path)) ?? found[0] ?? null;
  } catch {
    const native = join(home, ".local", "bin", "claude.exe");
    return existsSync(native) ? native : null;
  }
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
  detect: async () => existsSync(claudeFile) || existsSync(join(home, ".claude")) || !!(await claudeCli()),
  install: async (url) => {
    const cli = await claudeCli();
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
    const cli = await claudeCli();
    if (cli) await run(cli, ["mcp", "remove", NAME, "--scope", "user"]).catch(() => claudeJson.uninstall(key));
    else await claudeJson.uninstall(key);
  },
};

const installers: Installer[] = [
  claudeCode,
  codex,
  jsonInstaller("cursor", "Cursor", join(home, ".cursor", "mcp.json"), join(home, ".cursor"), "mcpServers", (url) => ({
    url,
  })),
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

/** Write the connection into one AI tool's configuration */
export async function installTool(id: McpInstallerId, url: string): Promise<void> {
  const installer = installers.find((entry) => entry.id === id);
  if (!installer) throw new McpError("validation", "不支持自动配置这个工具");
  try {
    await installer.install(url);
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError("config", `写入 ${installer.name} 配置失败，请用「复制给 AI 的一句话」手动连接`);
  }
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
