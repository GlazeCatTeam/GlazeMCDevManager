import type { WorkUploadParams } from "./work-editor";

export interface WorkSearchParams {
  account: string;
  kind: "pePrerequisite" | "pcPrerequisite" | "related";
  query: string;
}
export interface WorkReference {
  itemId: string;
  name: string;
}
export interface WorkImageDraft {
  token: string;
  preview: string;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
}
export interface WorkCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface WorkCropParams {
  account: string;
  token: string;
  crop: WorkCrop;
}
export type WorkImageParams = WorkUploadParams & { kind: "image" | "banner" | "videoCover" | "proof" };

/** Keep search requests bounded and restricted to audited resource pools */
export function isWorkSearchParams(value: unknown): value is WorkSearchParams {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.account === "string" &&
    !!p.account.trim() &&
    ["pePrerequisite", "pcPrerequisite", "related"].includes(String(p.kind)) &&
    typeof p.query === "string" &&
    p.query.trim().length > 0 &&
    p.query.length <= 100 &&
    Object.keys(p).every((k) => ["account", "kind", "query"].includes(k))
  );
}

/** Reject oversized or out-of-bounds source rectangles before native cropping */
export function validWorkCrop(
  crop: WorkCrop,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): boolean {
  return (
    !!crop &&
    [crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= width &&
    crop.y + crop.height <= height &&
    Math.abs(crop.width / crop.height - targetWidth / targetHeight) <= 2 / crop.height
  );
}
