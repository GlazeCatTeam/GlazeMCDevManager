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
import { emptyMcpData, type McpData, parseMcpData } from "@glaze/mcp";
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
  return parseMcpData(JSON.parse(safeStorage.decryptString(readFileSync(path))));
}
