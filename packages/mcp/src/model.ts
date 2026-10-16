import type {
  AccountSummary,
  McpAccessRequest,
  McpAsset,
  McpAudit,
  McpClient,
  McpDraft,
  McpOperation,
  WorkEditorDocument,
  WorkEditorOptions,
  WorkRecord,
  WorkReviewResult,
  WorkUpload,
} from "@glaze/contracts";
import { MCP_DEFAULT_PORT } from "@glaze/contracts";

export interface StoredClient extends Omit<McpClient, "connected" | "directories"> {
  /** Legacy bridge secrets are stripped from public snapshots during migration */
  token?: string;
  /** Connection key written into the AI tool's configuration by one-click connect */
  key?: string;
  directories: { id: string; name: string; path: string }[];
}
export interface StoredAsset extends McpAsset {
  path: string;
  receipt?: WorkUpload;
}
export interface StoredOperation extends McpOperation {
  draftId: string;
  revision: number;
  target?: string;
  key: string;
  fingerprint: string;
  assetParams?: { kind: McpAsset["kind"]; platform: "pe" | "pc"; channelId?: number; resourceType?: number };
  directoryId?: string;
  relativePath?: string;
}
export interface McpData {
  port: number;
  enabled: boolean;
  clients: StoredClient[];
  drafts: McpDraft[];
  assets: StoredAsset[];
  operations: StoredOperation[];
  audit: McpAudit[];
  draftKeys: Record<string, string>;
}
export interface McpPorts {
  save(data: McpData): void;
  changed(): void;
  /** Tell the user a tool is waiting for an answer, e.g. with a system notification */
  notify?(request: McpAccessRequest): void;
  accounts(): AccountSummary[];
  assertEnabled(method: string): void;
  read(method: string, params: Record<string, unknown>): Promise<unknown>;
  editor(account: string, itemId: string): Promise<WorkEditorDocument>;
  options(account: string): Promise<WorkEditorOptions>;
  validate(draft: McpDraft, patch: WorkRecord): Promise<{ field: string; message: string }[]>;
  saveWork(draft: McpDraft, patch: WorkRecord, beforeWrite: () => void): Promise<void>;
  createWork(draft: McpDraft, fields: WorkRecord, beforeWrite: () => void): Promise<void>;
  review(account: string, itemId: string, expected: WorkRecord, beforeWrite: () => void): Promise<WorkReviewResult>;
  pickFile(): Promise<string | null>;
  upload(draft: McpDraft, asset: StoredAsset, beforeWrite: () => void): Promise<WorkUpload>;
  invoke?(
    method: string,
    params: Record<string, unknown>,
    guard: () => void,
    beforeWrite: () => void,
  ): Promise<unknown>;
  invokePlugin?(
    clientId: string,
    tool: PluginToolTarget,
    params: Record<string, unknown>,
    guard: () => void,
    beforeWrite: () => void,
  ): Promise<unknown>;
  assetRoot: string;
}

export interface PluginToolTarget {
  pluginId: string;
  toolId: string;
  permissions: string[];
}

/** Only a fresh local store defaults to disabled */
export function emptyMcpData(): McpData {
  return {
    port: MCP_DEFAULT_PORT,
    enabled: false,
    clients: [],
    drafts: [],
    assets: [],
    operations: [],
    audit: [],
    draftKeys: {},
  };
}
export class McpError extends Error {
  constructor(
    public readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

/** Stable JSON equality for revision snapshots and request deduplication */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Strip secrets and upload receipts recursively before crossing the MCP boundary */
export function publicValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(cookie|password|ticket|token|sessionCookie|authorization|sign|receipt|path|fingerprint|key|body)$/i.test(
              key,
            ),
        )
        .map(([key, entry]) => [key, publicValue(entry)]),
    );
  return value;
}
