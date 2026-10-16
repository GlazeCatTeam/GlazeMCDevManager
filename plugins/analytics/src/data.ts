import type { AnalyticsMetric, AnalyticsRecord, AnalyticsValues, IncomePlatform, WorkSummary } from "@glaze/plugin-sdk";

export type Metric = AnalyticsMetric;
export type DayRange = 7 | 14 | 30;
export type MonthRange = 1 | 3 | 6 | 12;
export type RealtimeDay = "today" | "yesterday";
export interface Resource {
  id: string;
  name: string;
  category: string;
  color: string;
}
export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

export const metrics: { id: Metric; label: string; unit: string }[] = [
  { id: "downloads", label: "组件下载", unit: "次" },
  { id: "purchases", label: "购买次数", unit: "次" },
  { id: "diamonds", label: "钻石收益", unit: "钻石" },
  { id: "emeralds", label: "绿宝石收益", unit: "绿宝石" },
];

/** Beijing calendar date, independent of the desktop's timezone */
export function todayKey(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** Shift an ISO calendar day without daylight-saving changes */
export function shiftDay(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}

/** Completed Beijing days, excluding today's incomplete data */
export function daysInRange(days: DayRange, today = todayKey()): string[] {
  return Array.from({ length: days }, (_, index) => shiftDay(today, index - days));
}

/** Calendar months including the current partial month */
export function monthsInRange(months: MonthRange, today = todayKey()): string[] {
  const date = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: months }, (_, index) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months + index + 1, 1)).toISOString().slice(0, 7),
  );
}

/** Match upstream analysis eligibility: published at least once, excluding prerequisites */
export function isAnalyzableWork(work: Pick<WorkSummary, "isPrerequisite" | "onlineTime">): boolean {
  return !work.isPrerequisite && !!work.onlineTime && work.onlineTime !== "UNKNOWN";
}

/** Map eligible works into presentation-only colors */
export function workResources(works: WorkSummary[], platform: IncomePlatform = "pe"): Resource[] {
  return works.filter(isAnalyzableWork).map((work, index) => ({
    id: work.itemId,
    name: work.name,
    category: platform === "pc" ? "电脑资源" : "手游资源",
    color: `var(--g-chart-series-${(index % 4) + 1})`,
  }));
}

/** Preserve unknown metrics; daily ratings are averaged without inventing weights */
export function aggregate(records: AnalyticsValues[], metric: Metric): number | null {
  const values = records.map((record) => record[metric]);
  if (values.length === 0 || values.some((value) => value === null)) return null;
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return metric === "rating" ? total / values.length : total;
}

/** Rank resources by returned interval totals, excluding unknown values and preserving ties */
export function topResources(
  resources: Resource[],
  records: AnalyticsRecord[],
  dates: string[],
  metric: Metric,
): Resource[] {
  const allowedDates = new Set(dates);
  const byResource = new Map<string, AnalyticsRecord[]>();
  for (const record of records) {
    if (!allowedDates.has(record.date)) continue;
    const entries = byResource.get(record.resourceId);
    if (entries) entries.push(record);
    else byResource.set(record.resourceId, [record]);
  }
  return resources
    .map((resource) => ({ resource, total: aggregate(byResource.get(resource.id) ?? [], metric) }))
    .filter(
      (entry): entry is { resource: Resource; total: number } => entry.total !== null && Number.isFinite(entry.total),
    )
    .sort((left, right) => right.total - left.total)
    .slice(0, 10)
    .map((entry) => entry.resource);
}

const valueFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const ratingFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

/** Reuse formatters across rows and chart points while keeping unknown values distinct from zero */
export function formatValue(value: number | null | undefined, metric?: Metric): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (metric === "rating" ? ratingFormatter : valueFormatter).format(value);
}

/** Match chart points to exact platform dates, leaving gaps for absent rows */
export function trackingSeries(
  resources: Resource[],
  records: AnalyticsRecord[],
  dates: string[],
  metric: Metric,
): TrendSeries[] {
  const byResource = new Map<string, Map<string, AnalyticsRecord[]>>();
  for (const record of records) {
    let byDate = byResource.get(record.resourceId);
    if (!byDate) {
      byDate = new Map();
      byResource.set(record.resourceId, byDate);
    }
    const entries = byDate.get(record.date);
    if (entries) entries.push(record);
    else byDate.set(record.date, [record]);
  }
  return resources.map((resource) => ({
    id: resource.id,
    label: resource.name,
    color: resource.color,
    values: dates.map((date) => aggregate(byResource.get(resource.id)?.get(date) ?? [], metric)),
  }));
}
