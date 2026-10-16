import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { runStdioBridge } from "@glaze/mcp";
import { bridgeCredential } from "./credential";

/** Node-mode bridge avoids Windows GUI-subsystem stdin and Chromium profile side effects */
async function main(): Promise<void> {
  const id = process.argv[process.argv.indexOf("--mcp-client") + 1];
  const root = process.argv[process.argv.indexOf("--mcp-root") + 1];
  if (!id || !/^[\da-f-]{36}$/.test(id) || !root || !isAbsolute(root))
    throw new Error("MCP 连接配置无效，请在应用内重新生成");
  const token = bridgeCredential(readFileSync(join(root, `${id}.dpapi`), "utf8"), true);
  const endpoint = readFileSync(join(root, "endpoint"), "utf8");
  if (!/^\\\\\.\\pipe\\glaze-mcp-[\da-f-]{36}$/.test(endpoint)) throw new Error("MCP 本机地址无效");
  await runStdioBridge(endpoint, id, token);
}
void main().catch(() => {
  process.stderr.write("MCP 连接失败：请先打开 Glaze、开启服务，并检查客户端授权是否有效。\n");
  process.exitCode = 1;
});
