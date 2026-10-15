import type { AccountParams } from "./developer";
import type { IncomeEstimate, IncomePlatform } from "./income";

export type AnalyticsMetric = "downloads" | "purchases" | "diamonds" | "emeralds" | "favorites" | "rating";
export type AnalyticsValues = Record<AnalyticsMetric, number | null>;

export interface AnalyticsRecord extends AnalyticsValues {
  resourceId: string;
  name: string;
  date: string;
  peers: AnalyticsValues;
  /** Platform daily refund rate; absent values use the homepage estimate's zero-refund fallback */
  refundRate?: number | null;
}

export interface AnalyticsPeriodIncome {
  records: AnalyticsRecord[];
  /** Homepage calculation applied to this window's per-resource sales, or null when unavailable */
  estimate: Omit<IncomeEstimate, "month" | "startDate" | "endDate" | "works" | "failedWorks"> | null;
}

export interface AnalyticsRangeParams extends AccountParams {
  startDate: string;
  endDate: string;
}

export interface AnalyticsDailyParams extends AnalyticsRangeParams {
  /** Settlement platform; PC analytics maps to the upstream comp category */
  platform?: IncomePlatform;
  resourceIds: string[];
  /** Only module comparison needs the platform's extra peer statistics */
  includePeers?: boolean;
}

export interface AnalyticsRealtimeParams extends AccountParams {
  date: string;
  resourceIds: string[];
}

export interface AnalyticsOrder {
  id: string;
  resourceId: string;
  time: string;
  currency: string;
  amount: number;
  refundStatus: string;
}

export interface AnalyticsResourceIncome {
  resourceId: string;
  diamonds: number;
  emeralds: number;
  purchases: number;
  orders: AnalyticsOrder[];
  /** Invalid order rows are excluded without discarding authoritative totals */
  omittedOrderCount?: number;
  ordersIncomplete?: boolean;
}

export interface AnalyticsRealtime {
  resources: AnalyticsResourceIncome[];
  failedResourceIds: string[];
  failures?: { resourceId: string; kind: string; message: string }[];
  queriedAt?: string;
}

/** Validate a calendar date without accepting JavaScript's date overflow */
export function isAnalyticsDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

/** Bound analysis requests to a year and reject malformed ranges */
export function isAnalyticsRange(value: unknown): value is AnalyticsRangeParams {
  const params = value as AnalyticsRangeParams | null;
  return (
    !!params &&
    isAnalyticsDate(params.startDate) &&
    isAnalyticsDate(params.endDate) &&
    params.startDate <= params.endDate &&
    Date.parse(params.endDate) - Date.parse(params.startDate) <= 366 * 86_400_000
  );
}

/** Keep work identifiers intact and bound batch fan-out */
export function isAnalyticsResourceIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every((id) => typeof id === "string" && /^\d{1,32}$/.test(id)) &&
    new Set(value).size === value.length
  );
}
