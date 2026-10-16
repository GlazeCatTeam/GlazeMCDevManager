import { type McpPermission, mcpPermissions } from "./mcp";

// Plugin manifest (glaze-plugin.json) as read by both the main process and the renderer shell.
// Built-in and future third-party plugins register pages, navigation, settings sections, home widgets
// and MCP tools through the same contribution points. See docs/architecture/23-plugin-registry.md

export interface PluginPageContribution {
  id: string;
  title: string;
  /** "none": full-window page without the side navigation, e.g. login */
  chrome?: "none";
}

export interface PluginNavContribution {
  page: string;
  icon: string;
  group: "top" | "bottom";
  order: number;
  /** Sidebar group label for top items, e.g. "作品与玩家"; ungrouped items fall into "其他功能" */
  section?: string;
}

export interface PluginSettingsSectionContribution {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface PluginHomeWidgetContribution {
  id: string;
  title: string;
  order: number;
}

/** Restricted JSON Schema for tool input: a flat object of simple fields */
export interface PluginToolField {
  type: "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  /** Arrays hold strings only */
  items?: { type: "string"; maxLength?: number };
  maxItems?: number;
}

export interface PluginToolInput {
  type: "object";
  properties: Record<string, PluginToolField>;
  required?: string[];
}

export interface PluginToolContribution {
  /** Lowercase id, unique within the plugin; the MCP name is derived with pluginToolName */
  id: string;
  title: string;
  /** Written for the AI: what it returns, defaults, when not to use it */
  description: string;
  /** Single MCP permission gating the tool; must also be declared in the plugin's permissions */
  permission: McpPermission;
  risk: "read" | "write";
  input?: PluginToolInput;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions?: string[];
  activationEvents?: string[];
  contributes?: {
    pages?: PluginPageContribution[];
    navItems?: PluginNavContribution[];
    settingsSections?: PluginSettingsSectionContribution[];
    homeWidgets?: PluginHomeWidgetContribution[];
    tools?: PluginToolContribution[];
    [other: string]: unknown;
  };
}

/** Main process asks the renderer to run a plugin tool; the renderer answers with plugins.toolResult */
export interface PluginToolCall {
  callId: string;
  pluginId: string;
  toolId: string;
  params: Record<string, unknown>;
  /** Account the MCP client resolved for this call; null when the tool is account-independent */
  account: string | null;
  /** Permissions the handler may use: plugin permissions intersected with the client's grant */
  permissions: string[];
}

export type PluginToolResult =
  | { callId: string; ok: true; value: unknown }
  | { callId: string; ok: false; error: string };

const TOOL_ID = /^[a-z][a-z0-9_]{0,39}$/;
const FIELD_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const FIELD_TYPES = new Set(["string", "number", "integer", "boolean", "array"]);

/** MCP tool name for a plugin tool, e.g. glaze.analytics + top_sellers -> plugin_analytics_top_sellers */
export function pluginToolName(pluginId: string, toolId: string): string {
  const short = (pluginId.split(".").pop() ?? pluginId).toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return `plugin_${short}_${toolId}`;
}

/** Validate one manifest's tool contributions; returns readable problems, empty when valid */
export function validatePluginTools(manifest: PluginManifest): string[] {
  const problems: string[] = [];
  const tools = manifest.contributes?.tools ?? [];
  const seen = new Set<string>();
  for (const tool of tools) {
    const where = `${manifest.id} 的工具 ${tool?.id ?? "?"}`;
    if (!tool || typeof tool.id !== "string" || !TOOL_ID.test(tool.id)) problems.push(`${where}：id 格式无效`);
    else if (seen.has(tool.id)) problems.push(`${where}：id 重复`);
    else seen.add(tool.id);
    if (typeof tool?.title !== "string" || !tool.title.trim()) problems.push(`${where}：缺少标题`);
    if (typeof tool?.description !== "string" || !tool.description.trim()) problems.push(`${where}：缺少说明`);
    if (tool?.risk !== "read" && tool?.risk !== "write") problems.push(`${where}：risk 只能是 read 或 write`);
    if (!mcpPermissions.includes(tool?.permission) || tool.permission === "works:draft")
      problems.push(`${where}：权限无效`);
    else if (!(manifest.permissions ?? []).includes(tool.permission))
      problems.push(`${where}：权限 ${tool.permission} 未在插件 permissions 中声明`);
    else if (tool.risk === "read" && !tool.permission.endsWith(".read"))
      problems.push(`${where}：只读工具只能使用查看类权限`);
    const input = tool?.input;
    if (input === undefined) continue;
    if (input?.type !== "object" || !input.properties || typeof input.properties !== "object") {
      problems.push(`${where}：input 必须是 object`);
      continue;
    }
    for (const [name, field] of Object.entries(input.properties)) {
      if (!FIELD_NAME.test(name)) problems.push(`${where}：参数名 ${name} 无效`);
      if (!field || !FIELD_TYPES.has(field.type)) problems.push(`${where}：参数 ${name} 类型无效`);
      else if (field.type === "array" && field.items?.type !== "string")
        problems.push(`${where}：数组参数 ${name} 只能包含字符串`);
    }
    for (const name of input.required ?? [])
      if (!Object.hasOwn(input.properties, name)) problems.push(`${where}：必填参数 ${name} 未定义`);
  }
  return problems;
}
