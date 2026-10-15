import type { WorkParams, WorkStatus } from "./works";

export type WorkValue = string | number | boolean | null | WorkValue[] | WorkRecord;
export interface WorkRecord {
  [key: string]: WorkValue;
}

/** Editable sections share the platform's wire names, without exposing credentials */
export const workSections = {
  basic: [
    "item_name",
    "is_domain_server_item",
    "is_original",
    "tag",
    "activity_desc",
    "dlc_info",
    "relate_item_id",
    "sync_pc_flag",
  ],
  price: ["price", "price_rank", "price_type"],
  detail: ["info"],
  resource: [
    "pri_type",
    "sub_type",
    "mod_second_type",
    "mod_version",
    "label_type_list",
    "mount_call_enabled",
    "res",
    "prerequisite_items",
  ],
  images: ["channel"],
  banner: ["banner_pic"],
  video: ["video_info_list"],
  summary: ["update_summary"],
  shelf: ["weak_offline", "weak_offline_reason"],
  pc: ["sync_item_info"],
} as const;
export type WorkSection = keyof typeof workSections;

export interface WorkEditorDocument {
  itemId: string;
  status: WorkStatus;
  version: string;
  modCode: string;
  fields: WorkRecord;
  guides: WorkValue[];
}

export interface WorkOption {
  id: number;
  title: string;
}
export interface WorkImageSlot extends WorkOption {
  width: number;
  height: number;
  version: number;
}
export interface WorkEditorOptions {
  tags: string[];
  tagLimit: number;
  peTypes: WorkOption[];
  pcTypes: WorkOption[];
  peSubTypes: Record<string, WorkOption[]>;
  pcSubTypes: Record<string, WorkOption[]>;
  secondTypes: Record<string, WorkOption[]>;
  recommendTags: Record<string, WorkOption[]>;
  versions: string[];
  peImages: WorkImageSlot[];
  pcImages: WorkImageSlot[];
  pcTags: WorkOption[];
  pcScopes: { id: string; title: string }[];
  prices: { id: string; title: string; min: number; max: number | null; step: number }[];
}

export interface WorkSaveParams extends WorkParams {
  /** Baseline values only for patched keys, used for optimistic concurrency */
  base: WorkRecord;
  patch: WorkRecord;
}
export interface WorkReviewResult {
  needCheckApply: boolean;
  queueLength: number;
}
export type WorkUploadKind = "resource" | "image" | "banner" | "video" | "videoCover" | "richImage";
export interface WorkUploadParams extends WorkParams {
  kind: WorkUploadKind;
  channelId?: number;
  platform?: "pe" | "pc";
}
export interface WorkUpload {
  name: string;
  size: number;
  url: string;
  receipt: { body: string; sign: string; file_type: string };
}

/** JSON object guard used at the IPC boundary and by form readers */
export function isWorkRecord(value: unknown): value is WorkRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Bound JSON input size/depth and reject prototype keys before merging */
export function isWorkValue(value: unknown, depth = 0): value is WorkValue {
  if (depth > 20) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 2_000_000;
  if (Array.isArray(value)) return value.length <= 1000 && value.every((entry) => isWorkValue(entry, depth + 1));
  return (
    isWorkRecord(value) &&
    Object.entries(value).every(
      ([key, entry]) => !["__proto__", "prototype", "constructor"].includes(key) && isWorkValue(entry, depth + 1),
    )
  );
}

/** Accept only known editable fields, with a matching baseline for each field */
export function isWorkSaveParams(value: unknown): value is WorkSaveParams {
  if (!isWorkRecord(value) || typeof value.itemId !== "string" || !/^\d{1,32}$/.test(value.itemId)) return false;
  if (!isWorkRecord(value.patch) || !isWorkRecord(value.base) || !isWorkValue(value.patch) || !isWorkValue(value.base))
    return false;
  const allowed = new Set<string>(Object.values(workSections).flat());
  const keys = Object.keys(value.patch);
  const base = value.base;
  return (
    keys.length > 0 &&
    keys.every((key) => allowed.has(key) && Object.hasOwn(base, key)) &&
    Object.keys(base).every((key) => keys.includes(key))
  );
}
