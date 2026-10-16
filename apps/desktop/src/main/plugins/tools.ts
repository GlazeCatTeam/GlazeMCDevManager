import { type PluginManifest, validatePluginTools } from "@glaze/contracts";
import { pluginTool, type ToolDefinition } from "@glaze/mcp";

/** Discover valid contributions without preventing an invalid tool's plugin from loading */
export function discoverPluginTools(manifests: PluginManifest[], warn: (message: string) => void): ToolDefinition[] {
  const definitions: ToolDefinition[] = [];
  for (const manifest of manifests) {
    const problems: string[] = [];
    try {
      const tools = manifest.contributes?.tools ?? [];
      problems.push(...validatePluginTools(manifest));
      for (const tool of tools) {
        if (
          validatePluginTools({ ...manifest, contributes: { tools: [tool] } }).length ||
          tools.filter((entry) => entry.id === tool.id).length !== 1
        )
          continue;
        try {
          definitions.push(pluginTool(manifest, tool));
        } catch (error) {
          problems.push(`${tool.id}: ${error instanceof Error ? error.message : "参数定义无效"}`);
        }
      }
    } catch {
      problems.push("工具清单结构无效");
    }
    if (problems.length) warn(`${manifest.id} 的无效 MCP 工具已跳过：${problems.join("; ")}`);
  }
  const counts = new Map<string, number>();
  for (const tool of definitions) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
  return definitions.filter((tool) => {
    if (counts.get(tool.name) === 1) return true;
    warn(`${tool.plugin?.pluginId} 的 MCP 工具名冲突，已跳过：${tool.name}`);
    return false;
  });
}
