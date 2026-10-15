import type { WorkPriceType, WorkStatus } from "./works";

export const workOperationMethods = [
  "works.cancelReview",
  "works.publish",
  "works.appointOnline",
  "works.cancelAppointOnline",
  "works.submitSelfTest",
  "works.cancelTest",
  "works.delete",
  "works.changePrice",
] as const;
export type WorkOperationMethod = (typeof workOperationMethods)[number];

export interface WorkOperationParams {
  account: string;
  itemId: string;
  expectedStatus: WorkStatus;
  passCheck?: boolean;
  appointOnlineTime?: string;
  price?: number;
  expectedPrice?: number;
  expectedPriceType?: WorkPriceType;
}

export interface WorkOperationResult {
  outcome: "completed" | "uncertain";
}

export const workOperationStates: Record<WorkOperationMethod, readonly WorkStatus[]> = {
  "works.cancelReview": ["preparing", "reviewing"],
  "works.publish": ["accept"],
  "works.appointOnline": ["accept"],
  "works.cancelAppointOnline": ["appoint_online"],
  "works.submitSelfTest": ["init"],
  "works.cancelTest": ["self_test", "self_test_prepare"],
  "works.delete": ["init"],
  "works.changePrice": ["online"],
};

export const workDiamondPrices = [300, 600, 1000, 2000, 5000, 10000, 20000] as const;

/** Parse an exact platform wall-clock timestamp in Beijing time, rejecting calendar overflow */
export function workScheduleTime(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value.replace(" ", "T")}+08:00`);
  if (!Number.isFinite(time)) return null;
  const roundTrip = new Date(time + 8 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
  return roundTrip === value ? time : null;
}

/** Validate each operation's exact input shape before any platform access */
export function isWorkOperationParams(method: WorkOperationMethod, value: unknown): value is WorkOperationParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  const allowed = ["account", "itemId", "expectedStatus"];
  if (method === "works.submitSelfTest") allowed.push("passCheck");
  if (method === "works.appointOnline") allowed.push("appointOnlineTime");
  if (method === "works.changePrice") allowed.push("price", "expectedPrice", "expectedPriceType");
  if (Object.keys(p).some((key) => !allowed.includes(key))) return false;
  if (
    typeof p.account !== "string" ||
    !p.account.trim() ||
    typeof p.itemId !== "string" ||
    !/^\d{1,24}$/.test(p.itemId)
  )
    return false;
  if (!workOperationStates[method].includes(p.expectedStatus as WorkStatus)) return false;
  if (method === "works.submitSelfTest" && typeof p.passCheck !== "boolean") return false;
  if (
    method === "works.appointOnline" &&
    (typeof p.appointOnlineTime !== "string" || workScheduleTime(p.appointOnlineTime) === null)
  )
    return false;
  if (method === "works.changePrice") {
    if (p.expectedPriceType !== "diamond" && p.expectedPriceType !== "point") return false;
    if (typeof p.price !== "number" || !Number.isSafeInteger(p.price) || p.price <= 0 || p.price > 2_147_483_647)
      return false;
    if (
      typeof p.expectedPrice !== "number" ||
      !Number.isSafeInteger(p.expectedPrice) ||
      p.expectedPrice < 0 ||
      p.price === p.expectedPrice
    )
      return false;
    if (p.expectedPriceType === "diamond" && !(workDiamondPrices as readonly number[]).includes(p.price)) return false;
  }
  return true;
}
