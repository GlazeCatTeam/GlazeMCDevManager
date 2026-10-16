import type { McpInstallerId, McpLevel } from "@glaze/contracts";
import { type McpData, McpError, type McpService } from "@glaze/mcp";
import { checkTool, installTool } from "./installers";

interface ConnectionFiles {
  install: typeof installTool;
  check: typeof checkTool;
}

const files: ConnectionFiles = { install: installTool, check: checkTool };

/** Replace a key only after its configuration is verified, retaining the prior grant on failure */
export async function connectClient(
  service: Pick<McpService, "data" | "endpoint" | "createKeyedClient" | "revoke">,
  name: string,
  tool: McpInstallerId,
  level: McpLevel,
  configure = installTool,
) {
  const previous = tool === "other" ? [] : service.data.clients.filter((client) => client.tool === tool);
  const created = service.createKeyedClient(name, tool, level);
  if (tool === "other")
    return { ...created, installed: false, message: "把下面这句话发给你的 AI 工具，它会自己完成连接。" };
  try {
    await configure(tool, `${service.endpoint}?key=${created.key}`);
  } catch (error) {
    const original = previous.find((client) => client.key);
    if (original) service.revoke(created.client.id);
    return {
      ...(original?.key ? { client: original, key: original.key } : created),
      installed: false,
      message: `${error instanceof McpError ? error.message : `写入 ${name} 配置失败`}${original ? "；原连接与授权已保留" : ""}`,
    };
  }
  for (const client of previous) service.revoke(client.id);
  return {
    ...created,
    installed: true,
    message: `已写入 ${name} 的配置。重启 ${name} 后，直接用中文告诉它你想做什么即可。`,
  };
}

/** Move configured clients together, restoring earlier files if any later configuration fails */
export async function migrateConnections(
  clients: McpData["clients"],
  from: string | null,
  to: string,
  configuration: ConnectionFiles = files,
): Promise<void> {
  const restores: { name: string; restore: () => Promise<void> }[] = [];
  try {
    for (const client of clients) {
      if (!client.key || !client.tool || client.tool === "other") continue;
      const current = from ? await configuration.check(client.tool, `${from}?key=${client.key}`) : false;
      if (current === false) continue;
      if (current === null) throw new McpError("config", `无法读取 ${client.name} 的连接配置`);
      restores.push({
        name: client.name,
        restore: await configuration.install(client.tool, `${to}?key=${client.key}`),
      });
    }
  } catch (error) {
    const failed: string[] = [];
    for (const { name, restore } of restores.reverse()) {
      try {
        await restore();
      } catch (error) {
        failed.push(`${name} 的原配置未能恢复${error instanceof McpError ? `：${error.message}` : ""}`);
      }
    }
    const reason = error instanceof McpError ? error.message : "无法更新 AI 工具的连接配置";
    throw new McpError(
      "config",
      `端口未切换：${reason}${failed.length ? `；${failed.join("；")}` : ""}；请在 AI 助手中检查并「重新写入」连接配置`,
    );
  }
}
