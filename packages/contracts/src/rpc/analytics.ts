import type { AccountParams } from "./developer";
import type { IncomeEstimate, IncomePlatform } from "./income";

export type AnalyticsMetric =
  | "downloads"
  | "purchases"
  | "diamonds"
  | "emeralds"
  | "favorites"
  | "rating"
  | "activeUsers"
  | "refundRate"
  | "playtime";
/** Daily refundRate is a 0-1 ratio; playtime is the platform's per-player average in minutes */
export type AnalyticsValues = Record<AnalyticsMetric, number | null>;

export interface AnalyticsRecord extends AnalyticsValues {
  resourceId: string;
  name: string;
  date: string;
  peers: AnalyticsValues;
}

export interface AnalyticsPeriodIncome {
  records: AnalyticsRecord[];
  /** PE period-only candidate from month totals; daily records and homepage estimates stay independent */
  estimate: AnalyticsPeriodEstimate | null;
  estimateError?: string;
}

export interface AnalyticsIncomeAllocation {
  resourceId: string;
  name: string;
  diamonds: number;
  developerShareYuan: number;
  subsidyYuan: number;
  totalYuan: number;
  taxYuan: number;
  afterTaxYuan: number;
}

/** Account-wide PE estimate with additive, cent-exact resource allocations */
export interface AnalyticsPeriodEstimate extends IncomeEstimate {
  allocations: AnalyticsIncomeAllocation[];
}

export interface AnalyticsRangeParams extends AccountParams {
  startDate: string;
  endDate: string;
}

export interface AnalyticsDailyParams extends AnalyticsRangeParams {
  /** Settlement platform; PC analytics maps to the upstream comp category */
  platform?: IncomePlatform;
  resourceIds: string[];
  /** Enable platform peer statistics and PE resource follower counts */
  includePeers?: boolean;
}

export interface AnalyticsPeriodIncomeParams extends AnalyticsDailyParams {
  /** Month associated with the cycle end, even when daily querying ends earlier */
  settlementMonth?: string;
  /** Legacy display scope flag; PE financial calculations always use the entire available account */
  allResources?: boolean;
}

export interface AnalyticsRealtimeParams extends AccountParams {
  /** First Beijing calendar day; omitting endDate keeps the existing single-day query */
  date: string;
  endDate?: string;
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

/** Accept bounded Beijing date intervals while preserving legacy single-day callers */
export function isAnalyticsRealtimeParams(value: unknown): value is AnalyticsRealtimeParams {
  const params = value as AnalyticsRealtimeParams | null;
  return (
    !!params &&
    isAnalyticsDate(params.date) &&
    isAnalyticsRange({
      startDate: params.date,
      endDate: params.endDate === undefined ? params.date : params.endDate,
    }) &&
    Date.parse(params.endDate ?? params.date) - Date.parse(params.date) < 366 * 86_400_000 &&
    isAnalyticsResourceIds(params.resourceIds)
  );
}
