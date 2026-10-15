// Deterministic preview data, shared by charts, cards and tables until the capability client exists
export type Metric = "downloads" | "purchases" | "diamonds" | "emeralds" | "favorites" | "rating";
export type DayRange = 7 | 14 | 30;
export type MonthRange = 3 | 6 | 12;
export type RealtimeDay = "today" | "yesterday";

export interface Resource {
  id: string;
  name: string;
  category: string;
  price: number;
  color: string;
}

export interface DailyRecord extends Record<Metric, number> {
  resourceId: string;
  date: string;
}

export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

export interface Order {
  id: string;
  resourceId: string;
  time: string;
  currency: "diamond" | "emerald";
  amount: number;
}

export const previewDate = "2026-10-15";
export const metrics: { id: Metric; label: string; unit: string }[] = [
  { id: "downloads", label: "组件下载", unit: "次" },
  { id: "purchases", label: "付费次数", unit: "笔" },
  { id: "diamonds", label: "钻石收益", unit: "钻石" },
  { id: "emeralds", label: "绿宝石收益", unit: "绿宝石" },
  { id: "favorites", label: "收藏量", unit: "次" },
  { id: "rating", label: "评分", unit: "分" },
];

export const resources: Resource[] = [
  { id: "forest", name: "奇幻森林", category: "冒险模组", price: 128, color: "var(--g-chart-series-1)" },
  { id: "ocean", name: "海岛生活", category: "生存地图", price: 98, color: "var(--g-chart-series-2)" },
  { id: "magic", name: "魔法新领域", category: "玩法模组", price: 66, color: "var(--g-chart-series-3)" },
  { id: "village", name: "田园物语", category: "生存模组", price: 88, color: "var(--g-chart-series-4)" },
];

/** Format a UTC calendar day without depending on the machine timezone */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Build an inclusive date range ending on the last complete preview day */
export function daysInRange(days: DayRange): string[] {
  return Array.from({ length: days }, (_, index) => dateKey(new Date(Date.UTC(2026, 9, 15 - days + index))));
}

/** Produce the same day and resource values for every view */
export function dailyRecord(resource: Resource, date: string): DailyRecord {
  const resourceIndex = resources.findIndex((item) => item.id === resource.id);
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const wave = 1 + Math.sin(day * 0.55 + resourceIndex * 0.7) * 0.24 + Math.cos(day * 0.21) * 0.1;
  const scale = date === previewDate ? 0.58 : 1;
  const purchases = Math.max(1, Math.round((34 - resourceIndex * 5) * wave * scale));
  const emeraldOrders = Math.floor(purchases / 5);
  return {
    resourceId: resource.id,
    date,
    downloads: Math.round((1480 - resourceIndex * 250) * wave * scale),
    purchases,
    diamonds: (purchases - emeraldOrders) * resource.price,
    emeralds: emeraldOrders * resource.price * 10,
    favorites: Math.round((160 - resourceIndex * 22) * wave * scale),
    rating: Math.round((4.5 + Math.sin(day * 0.3 + resourceIndex) * 0.3) * 10) / 10,
  };
}

/** Query selected resources in chronological order */
export function queryTracking(resourceIds: string[], days: DayRange): DailyRecord[] {
  return daysInRange(days).flatMap((date) =>
    resources.filter((resource) => resourceIds.includes(resource.id)).map((resource) => dailyRecord(resource, date)),
  );
}

/** Sum counters and average ratings using their download counts as weights */
export function aggregate(records: DailyRecord[], metric: Metric): number {
  if (metric === "rating") {
    const downloads = records.reduce((total, record) => total + record.downloads, 0);
    return downloads === 0
      ? 0
      : records.reduce((total, record) => total + record.rating * record.downloads, 0) / downloads;
  }
  return records.reduce((total, record) => total + record[metric], 0);
}

/** Present precise totals and one decimal place for ratings */
export function formatValue(value: number, metric?: Metric): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: metric === "rating" ? 1 : 0,
    minimumFractionDigits: metric === "rating" ? 1 : 0,
  }).format(value);
}

/** Get chronological month identifiers including the current partial month */
export function monthsInRange(months: MonthRange): string[] {
  return Array.from({ length: months }, (_, index) =>
    dateKey(new Date(Date.UTC(2026, 10 - months + index, 1))).slice(0, 7),
  );
}

/** Query completed days in one calendar month, excluding future preview dates */
export function queryMonth(month: string, resourceIds: string[]): DailyRecord[] {
  const start = new Date(`${month}-01T00:00:00Z`);
  const length = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)
    .filter((date) => date < previewDate)
    .flatMap((date) =>
      resources.filter((resource) => resourceIds.includes(resource.id)).map((resource) => dailyRecord(resource, date)),
    );
}

/** Build a resource series from the same records used by the summary table */
export function trackingSeries(records: DailyRecord[], dates: string[], metric: Metric): TrendSeries[] {
  return resources
    .filter((resource) => records.some((record) => record.resourceId === resource.id))
    .map((resource) => ({
      id: resource.id,
      label: resource.name,
      color: resource.color,
      values: dates.map((date) =>
        aggregate(
          records.filter((record) => record.resourceId === resource.id && record.date === date),
          metric,
        ),
      ),
    }));
}

/** Derive a deterministic peer sample for the single-resource comparison */
export function peerRecord(record: DailyRecord): DailyRecord {
  return {
    ...record,
    downloads: Math.round(record.downloads * 0.72),
    purchases: Math.round(record.purchases * 0.68),
    diamonds: Math.round(record.diamonds * 0.68),
    emeralds: Math.round(record.emeralds * 0.74),
    favorites: Math.round(record.favorites * 0.77),
    rating: Math.round((record.rating - 0.3) * 10) / 10,
  };
}

/** Expand daily purchase counters into matching, stable order records */
export function queryOrders(day: RealtimeDay): Order[] {
  const date = day === "today" ? previewDate : "2026-10-14";
  return resources
    .flatMap((resource, resourceIndex) => {
      const record = dailyRecord(resource, date);
      return Array.from({ length: record.purchases }, (_, index) => {
        const currency = (index + 1) % 5 === 0 ? "emerald" : "diamond";
        const minutes = Math.floor(((index + 1) / (record.purchases + 1)) * (day === "today" ? 840 : 1440));
        return {
          id: `${date.replaceAll("-", "")}${resourceIndex + 1}${String(index + 1).padStart(4, "0")}`,
          resourceId: resource.id,
          time: `${date} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(resourceIndex * 11).padStart(2, "0")}`,
          currency,
          amount: resource.price * (currency === "emerald" ? 10 : 1),
        } satisfies Order;
      });
    })
    .sort((left, right) => right.time.localeCompare(left.time));
}

/** Summarize the visible order set without inferring currency conversion */
export function orderTotals(orders: Order[]) {
  return {
    diamonds: orders.filter((order) => order.currency === "diamond").reduce((total, order) => total + order.amount, 0),
    emeralds: orders.filter((order) => order.currency === "emerald").reduce((total, order) => total + order.amount, 0),
    purchases: orders.length,
  };
}
