import type { WorkEditorDocument, WorkRecord, WorkUploadKind } from "./work-editor";

export const MCP_DEFAULT_PORT = 17839;

/** Accept only explicit TCP ports usable by a local MCP listener */
export function isMcpPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export const mcpPermissions = [
  "netease:account.read",
  "netease:works.read",
  "netease:analytics.read",
  "netease:rank.read",
  "netease:promotion.read",
  "netease:income.read",
  "netease:works.write",
  "netease:promotion.write",
  "netease:community.read",
  "netease:community.write",
  "netease:messages.read",
  "netease:messages.write",
  "works:draft",
  "works:upload",
  "works:save",
  "works:review",
] as const;
export type McpPermission = (typeof mcpPermissions)[number];

/** Plain-language names shown to users and returned to AI tools by glaze_status */
export const mcpPermissionLabels: Record<McpPermission, string> = {
  "netease:account.read": "查看账号信息与开发者等级",
  "netease:works.read": "查看作品",
  "netease:analytics.read": "查看数据分析",
  "netease:rank.read": "查看排行榜",
  "netease:promotion.read": "查看活动",
  "netease:income.read": "查看收益与结算",
  "works:draft": "旧版编辑权限",
  "netease:works.write": "上架、撤回、调价、自测与删除作品",
  "netease:promotion.write": "报名活动与申请轮播图",
  "netease:community.read": "查看玩家评论与反馈",
  "netease:community.write": "回复玩家评论与反馈",
  "netease:messages.read": "查看系统消息",
  "netease:messages.write": "标记已读与删除系统消息",
  "works:upload": "上传作品素材",
  "works:save": "新建与修改作品",
  "works:review": "提交作品审核",
};

/** Permissions a user can toggle; legacy draft access is kept only for stored grants */
export const mcpSelectablePermissions: McpPermission[] = mcpPermissions.filter(
  (permission) => permission !== "works:draft",
);

export type McpLevel = "view" | "assist" | "full";
const readPermissions = mcpSelectablePermissions.filter((permission) => permission.endsWith(".read"));
const assistPermissions: McpPermission[] = [
  ...readPermissions,
  "netease:community.write",
  "netease:messages.write",
  "works:upload",
  "works:save",
];
/** Three permission levels replace per-permission choices for most users */
export const mcpLevels: Record<McpLevel, { title: string; description: string; permissions: McpPermission[] }> = {
  view: {
    title: "只看数据",
    description: "查询作品、数据、评论和消息，不查看收益，不做任何修改",
    permissions: readPermissions.filter((permission) => permission !== "netease:income.read"),
  },
  assist: {
    title: "帮我打理",
    description: "查看全部数据和收益，修改作品、上传素材、回复玩家、处理消息",
    permissions: assistPermissions,
  },
  full: {
    title: "完全托管",
    description: "在帮我打理的基础上，还可以提审、上架、调价、删除作品和报名活动",
    permissions: [...mcpSelectablePermissions],
  },
};

/** Match a permission set to a level, or report a custom selection */
export function mcpLevelOf(permissions: readonly McpPermission[]): McpLevel | "custom" {
  const selected = new Set<McpPermission>(permissions.filter((permission) => permission !== "works:draft"));
  for (const level of ["view", "assist", "full"] as const) {
    const expected = mcpLevels[level].permissions;
    if (expected.length === selected.size && expected.every((permission) => selected.has(permission))) return level;
  }
  return "custom";
}

/** AI tools Glaze can configure with one click; "other" only produces copyable instructions */
export type McpInstallerId = "claude-code" | "codex" | "cursor" | "vscode" | "windsurf" | "gemini" | "other";
export interface McpInstaller {
  id: McpInstallerId;
  name: string;
  detected: boolean;
  /** Where the configuration is written, in plain words */
  target: string;
}
export interface McpConnectResult {
  clientId: string;
  installed: boolean;
  message: string;
  /** Connection address including this client's key */
  endpoint: string;
  /** A sentence the user can paste into any AI tool so it configures itself */
  prompt: string;
}

export type McpDecision = "always" | "once" | "deny";
export interface McpAccessRequest {
  id: string;
  clientId: string;
  clientName: string;
  /** "connect": an unknown tool wants to connect; "permission": a connected tool needs more access */
  kind: "connect" | "permission";
  permissions: McpPermission[];
  reason: string;
  createdAt: number;
  expiresAt: number;
}

export interface McpGrant {
  accounts: string[];
  defaultAccount: string;
  permissions: McpPermission[];
}
export interface McpClient extends McpGrant {
  id: string;
  name: string;
  approved: boolean;
  connected: boolean;
  lastSeen: string | null;
  expiresAt: number;
  directories: { id: string; name: string }[];
  /** Tool configured by one-click connect; absent for manual connections */
  tool?: McpInstallerId;
  /** Keyed clients keep their grant across reconnects */
  persistent?: boolean;
}
export type McpOperationState =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "rejected"
  | "expired"
  | "unknown"
  | "platform_action"
  | "created_id_unresolved";
export type McpAction = "import" | "upload" | "create" | "save" | "save_review" | "review" | "business";
export interface McpOperation {
  method?: string;
  /** Human-readable name of the tool that started this operation */
  title?: string;
  itemId?: string;
  id: string;
  clientId: string;
  clientName: string;
  account: string;
  draftId?: string;
  revision?: number;
  action: McpAction;
  state: McpOperationState;
  phase: string;
  message: string;
  createdAt: number;
  expiresAt: number;
  assetId?: string;
  result?: unknown;
  resolvedAt?: number;
}
export interface McpDraft {
  purpose?: "works" | "promotion";
  id: string;
  clientId: string;
  account: string;
  itemId: string | null;
  revision: number;
  document: WorkEditorDocument;
  patch: WorkRecord;
  updatedAt: number;
  locked: boolean;
  previewFields?: WorkRecord;
}
export interface McpAsset {
  id: string;
  draftId: string;
  name: string;
  size: number;
  hash: string;
  kind: WorkUploadKind;
  platform: "pe" | "pc";
  channelId?: number;
  resourceType?: number;
  uploaded: boolean;
  expiresAt: number;
}
export interface McpAudit {
  id: string;
  time: string;
  clientId: string;
  clientName: string;
  tool: string;
  /** Human-readable tool name for activity lists */
  title?: string;
  account: string | null;
  result: string;
}
export interface McpSnapshot {
  port: number;
  endpoint: string | null;
  enabled: boolean;
  status: "off" | "starting" | "running" | "error";
  error: string | null;
  clients: McpClient[];
  requests: McpAccessRequest[];
  operations: McpOperation[];
  drafts: McpDraft[];
  assets: McpAsset[];
  audit: McpAudit[];
}
