import type { WorkEditorDocument, WorkRecord, WorkUploadKind } from "./work-editor";

export const mcpPermissions = [
  "netease:account.read",
  "netease:works.read",
  "netease:analytics.read",
  "netease:rank.read",
  "netease:promotion.read",
  "netease:income.read",
  "works:draft",
  "works:upload",
  "works:save",
  "works:review",
] as const;
export type McpPermission = (typeof mcpPermissions)[number];
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
export type McpAction = "import" | "upload" | "create" | "save" | "save_review" | "review";
export interface McpOperation {
  id: string;
  clientId: string;
  clientName: string;
  account: string;
  draftId: string;
  revision: number;
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
  account: string | null;
  result: string;
}
export interface McpSnapshot {
  enabled: boolean;
  status: "off" | "starting" | "running" | "error";
  error: string | null;
  clients: McpClient[];
  operations: McpOperation[];
  drafts: McpDraft[];
  assets: McpAsset[];
  audit: McpAudit[];
}
export interface McpInvitation {
  clientId: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  expiresAt: number;
}
