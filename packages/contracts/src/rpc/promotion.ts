import { isWorkRecord, type WorkUpload } from "./work-editor";

export interface PromotionPageParams {
  account?: string;
  page: number;
}
export interface PromotionModuleParams {
  account?: string;
  kind: "review" | "discount";
  activityId: string;
  moduleId: string;
}
export interface PromotionModule {
  id: string;
  name: string;
  description: string;
  minDiscount: number | null;
  maxDiscount: number | null;
  minDiamond: number | null;
  priceUpdateDays: number | null;
}
export interface PromotionActivity {
  id: string;
  name: string;
  description: string;
  instruction: string;
  banner: string | null;
  beginAt: number;
  applyEndAt: number;
  endAt: number;
  modules: PromotionModule[];
  partitions: { id: string; name: string; rule: string }[];
}
export interface PromotionWork {
  id: string;
  name: string;
  price: number | null;
  priceType: string;
  status: string;
  discount: number | null;
}
export interface PromotionModuleData {
  candidates: PromotionWork[];
  joined: PromotionWork[];
}
export interface PromotionDates {
  dates: { time: number; allowed: boolean; reason: string; recent: boolean }[];
}
export interface BannerFields {
  itemId: string;
  startTime: number;
  imageUrl: string;
  extra: string;
  activity: string;
  feature: string;
  update: string;
}
export interface BannerApplication extends BannerFields {
  id: string;
  itemName: string;
  status: string;
  applyTime: number;
  position: string;
}
export type PromotionReceipt = WorkUpload["receipt"];
export interface PromotionJoinParams extends PromotionModuleParams {
  account: string;
  itemIds: string[];
  intro: string;
  discount: number;
  partitionId: string;
  images: PromotionReceipt[];
  videos: PromotionReceipt[];
}
export interface BannerSaveParams extends BannerFields {
  account: string;
  applicationId?: string;
}

/** Limit identifiers used in API paths without truncating long platform IDs */
export function isPromotionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

/** Validate bounded offsets before constructing a paged request */
export function isPromotionPage(value: unknown): value is PromotionPageParams {
  return (
    isWorkRecord(value) && Number.isSafeInteger(value.page) && Number(value.page) >= 0 && Number(value.page) <= 100000
  );
}

/** Reject unknown module kinds and malformed route segments */
export function isPromotionModule(value: unknown): value is PromotionModuleParams {
  return (
    isWorkRecord(value) &&
    (value.kind === "review" || value.kind === "discount") &&
    isPromotionId(value.activityId) &&
    isPromotionId(value.moduleId)
  );
}

/** Bound signed file receipts without substituting arbitrary URLs for upload results */
function receipts(value: unknown, kind: string, limit: number): boolean {
  return (
    Array.isArray(value) &&
    value.length <= limit &&
    value.every(
      (item) =>
        isWorkRecord(item) &&
        item.file_type === kind &&
        typeof item.body === "string" &&
        item.body.length > 0 &&
        item.body.length <= 100000 &&
        typeof item.sign === "string" &&
        item.sign.length > 0 &&
        item.sign.length <= 8192,
    )
  );
}

/** Reject empty rich introductions, including editor filler tags and whitespace entities */
export function hasPromotionIntro(value: string): boolean {
  return (
    value
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&(?:nbsp|#0*160|#x0*a0|#0*32|#x0*20);/gi, " ")
      .replace(/[\s\u200b-\u200d\ufeff]/g, "").length > 0
  );
}

/** Validate enrollment fields and screenshot-aligned material limits in the host */
export function isPromotionJoin(value: unknown): value is PromotionJoinParams {
  if (!isWorkRecord(value) || !isPromotionModule(value)) return false;
  const item = value as unknown as Record<string, unknown>;
  return (
    typeof item.account === "string" &&
    item.account.length > 0 &&
    Array.isArray(item.itemIds) &&
    item.itemIds.length > 0 &&
    item.itemIds.length <= 100 &&
    item.itemIds.every(isPromotionId) &&
    new Set(item.itemIds).size === item.itemIds.length &&
    (value.kind !== "review" || item.itemIds.length === 1) &&
    typeof item.intro === "string" &&
    item.intro.length <= 10000 &&
    (value.kind !== "review" || hasPromotionIntro(item.intro)) &&
    Number.isInteger(item.discount) &&
    Number(item.discount) >= 0 &&
    Number(item.discount) <= 100 &&
    (item.partitionId === "" || isPromotionId(item.partitionId)) &&
    receipts(item.images, "image", value.kind === "review" ? 3 : 10) &&
    receipts(item.videos, "video", value.kind === "review" ? 1 : 10)
  );
}

/** Validate banner form fields; host verifies platform image domains and live eligibility */
export function isBannerSave(value: unknown): value is BannerSaveParams {
  return (
    isWorkRecord(value) &&
    typeof value.account === "string" &&
    value.account.length > 0 &&
    isPromotionId(value.itemId) &&
    (value.applicationId === undefined || isPromotionId(value.applicationId)) &&
    Number.isSafeInteger(value.startTime) &&
    Number(value.startTime) > 0 &&
    typeof value.imageUrl === "string" &&
    value.imageUrl.length > 0 &&
    value.imageUrl.length <= 4096 &&
    [value.extra, value.activity, value.feature, value.update].every(
      (item) => typeof item === "string" && item.length <= 20000,
    )
  );
}
