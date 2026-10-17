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
  { id: "purchases", label: "新增购买", unit: "次" },
  { id: "downloads", label: "销售总量", unit: "次" },
  { id: "diamonds", label: "钻石收益", unit: "钻石" },
  { id: "emeralds", label: "绿宝石收益", unit: "绿宝石" },
  { id: "activeUsers", label: "日活", unit: "人" },
  { id: "refundRate", label: "退款率", unit: "%" },
  { id: "playtime", label: "人均游玩时长", unit: "分钟" },
  { id: "favorites", label: "组件涨粉", unit: "人" },
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

/** Explain invalid custom intervals before issuing a daily query */
export function dateRangeError(start: string, end: string, today = todayKey()): string | null {
  if (!start || !end) return "请选择开始和结束日期";
  for (const date of [start, end]) {
    const time = Date.parse(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(time) ||
      new Date(time).toISOString().slice(0, 10) !== date
    ) {
      return "请输入有效日期";
    }
  }
  if (start > end) return "开始日期不能晚于结束日期";
  if (end >= today) return "只能选择昨天及以前的完整日数据";
  if (Date.parse(end) - Date.parse(start) >= 366 * 86_400_000) return "一次最多选择 366 天（含起止日期）";
  return null;
}

/** Enumerate an inclusive, validated interval without local timezone or daylight-saving shifts */
export function datesBetween(start: string, end: string, today = todayKey()): string[] {
  if (dateRangeError(start, end, today)) return [];
  const length = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  return Array.from({ length }, (_, index) => shiftDay(start, index));
}

/** Calendar months including the current partial month */
export function monthsInRange(months: MonthRange, today = todayKey()): string[] {
  const date = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: months }, (_, index) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months + index + 1, 1)).toISOString().slice(0, 7),
  );
}

/** Validate an inclusive month interval before issuing at most twelve monthly queries */
export function monthRangeError(start: string, end: string, today = todayKey()): string | null {
  if (!start || !end) return "请选择开始月份和结束月份";
  for (const month of [start, end]) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "0001-01") return "请输入有效月份";
  }
  if (start > end) return "开始月份不能晚于结束月份";
  if (end > today.slice(0, 7)) return "不能选择未来月份";
  const count =
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5)) - Number(start.slice(5)) + 1;
  return count > 12 ? "一次最多选择 12 个月（含起止月份）" : null;
}

/** Resolve complete historical months and cap the current month at yesterday in Beijing */
export function summaryMonthRange(start: string, end: string, today = todayKey()) {
  const error = monthRangeError(start, end, today);
  if (error) return { monthKeys: [] as string[], startDate: "", endDate: "", error };
  const monthKeys: string[] = [];
  const cursor = new Date(`${start}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 7) <= end) {
    monthKeys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const lastDay = new Date(cursor.getTime() - 86_400_000).toISOString().slice(0, 10);
  const yesterday = shiftDay(today, -1);
  return { monthKeys, startDate: `${start}-01`, endDate: lastDay > yesterday ? yesterday : lastDay, error: null };
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

/** Rates, per-player time and daily active users use daily means rather than misleading sums */
export function isAverageMetric(metric: Metric): boolean {
  return metric === "rating" || metric === "refundRate" || metric === "playtime" || metric === "activeUsers";
}

/** Preserve unknown metrics and use unweighted daily means when totals are not meaningful */
export function aggregate(records: AnalyticsValues[], metric: Metric): number | null {
  const values = records.map((record) => record[metric]);
  if (values.length === 0 || values.some((value) => value == null || !Number.isFinite(value))) return null;
  if (metric === "refundRate" && values.some((value) => value !== null && (value < 0 || value > 1))) return null;
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return isAverageMetric(metric) ? total / values.length : total;
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
const percentFormatter = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 2 });

/** Reuse formatters across rows and chart points while keeping unknown values distinct from zero */
export function formatValue(value: number | null | undefined, metric?: Metric): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (metric === "refundRate") return percentFormatter.format(value);
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
