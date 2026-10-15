import type { AnalyticsRecord } from "@glaze/plugin-sdk";
import { aggregate, type Resource, shiftDay, todayKey } from "./data";

export const incomeMetrics = [
  { id: "diamonds", label: "钻石收益", unit: "钻石" },
  { id: "emeralds", label: "绿宝石收益", unit: "绿宝石" },
  { id: "purchases", label: "购买次数", unit: "次" },
] as const;
export type IncomeMetric = (typeof incomeMetrics)[number]["id"];

const yuanFormatter = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });

/** Format main-process payout estimates without presenting missing values as zero */
export function periodIncomeYuan(yuan: number | null | undefined): string {
  return yuan === null || yuan === undefined || !Number.isFinite(yuan) ? "—" : yuanFormatter.format(yuan);
}

/** Include both boundary 22nds; advance the current cycle on the 23rd and omit today's unfinished data */
export function incomeCycle(offset = 0, today = todayKey()) {
  const anchor = new Date(`${today}T00:00:00Z`);
  const month = anchor.getUTCMonth() - (anchor.getUTCDate() < 23 ? 1 : 0) + offset;
  const startDate = new Date(Date.UTC(anchor.getUTCFullYear(), month, 22)).toISOString().slice(0, 10);
  const nextStart = new Date(Date.UTC(anchor.getUTCFullYear(), month + 1, 22)).toISOString().slice(0, 10);
  const endDate = nextStart;
  const yesterday = shiftDay(today, -1);
  const queryEnd = endDate < yesterday ? endDate : yesterday;
  const dates =
    queryEnd < startDate
      ? []
      : Array.from({ length: Math.round((Date.parse(queryEnd) - Date.parse(startDate)) / 86_400_000) + 1 }, (_, i) =>
          shiftDay(startDate, i),
        );
  return { startDate, endDate, nextStart, dates, queryEnd: dates.length ? queryEnd : null };
}

/** Index real day records once; absent rows stay unknown rather than becoming zero income */
export function summarizePeriodIncome(resources: Resource[], records: AnalyticsRecord[], dates: string[]) {
  const ids = new Set(resources.map((resource) => resource.id));
  const wantedDates = new Set(dates);
  const matched = records.filter((row) => ids.has(row.resourceId) && wantedDates.has(row.date));
  const byDate = new Map<string, AnalyticsRecord[]>();
  const byResource = new Map<string, AnalyticsRecord[]>();
  const pairs = new Set<string>();
  for (const row of matched) {
    const dayRows = byDate.get(row.date) ?? [];
    dayRows.push(row);
    byDate.set(row.date, dayRows);
    const resourceRows = byResource.get(row.resourceId) ?? [];
    resourceRows.push(row);
    byResource.set(row.resourceId, resourceRows);
    pairs.add(`${row.resourceId}:${row.date}`);
  }
  const totals = (rows: AnalyticsRecord[]) => ({
    diamonds: aggregate(rows, "diamonds"),
    emeralds: aggregate(rows, "emeralds"),
    purchases: aggregate(rows, "purchases"),
  });
  return {
    totals: totals(matched),
    recordCount: matched.length,
    missingDays: resources.length * dates.length - pairs.size,
    daily: dates.map((date) => ({ date, ...totals(byDate.get(date) ?? []) })),
    resources: resources.map((resource) => {
      const rows = byResource.get(resource.id) ?? [];
      return { resource, ...totals(rows), days: new Set(rows.map((row) => row.date)).size };
    }),
  };
}
