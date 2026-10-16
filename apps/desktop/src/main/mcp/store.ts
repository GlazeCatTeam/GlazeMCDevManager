import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { isMcpPort, MCP_DEFAULT_PORT } from "@glaze/contracts";
import { emptyMcpData, type McpData } from "@glaze/mcp";
import { safeStorage } from "electron";

/** Write an encrypted snapshot durably before any platform mutation is sent */
export function saveMcpData(path: string, data: McpData): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("系统加密不可用，MCP 未保存任何授权");
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  const descriptor = openSync(temporary, "w", 0o600);
  try {
    writeFileSync(descriptor, safeStorage.encryptString(JSON.stringify(data)));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, path);
}

/** A damaged store fails closed and is never silently replaced with a new empty store */
export function loadMcpData(path: string): McpData {
  if (!existsSync(path)) return emptyMcpData();
  const data = JSON.parse(safeStorage.decryptString(readFileSync(path))) as McpData;
  if (
    !data ||
    typeof data.enabled !== "boolean" ||
    !Array.isArray(data.clients) ||
    !Array.isArray(data.operations) ||
    !Array.isArray(data.drafts) ||
    !Array.isArray(data.assets) ||
    !Array.isArray(data.audit) ||
    !data.draftKeys
  )
    throw new Error("MCP 授权文件无法读取，请保留原文件并检查日志");
  // Older stores used a fixed port and have no port field
  if (data.port === undefined) data.port = MCP_DEFAULT_PORT;
  if (!isMcpPort(data.port)) throw new Error("MCP 端口配置无效，请保留原文件并检查日志");
  return data;
}
