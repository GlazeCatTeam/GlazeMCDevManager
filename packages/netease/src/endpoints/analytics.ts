import {
  type AnalyticsDailyParams,
  type AnalyticsOrder,
  type AnalyticsRangeParams,
  type AnalyticsRealtime,
  type AnalyticsRealtimeParams,
  type AnalyticsRecord,
  type AnalyticsResourceIncome,
  type AnalyticsValues,
  isAnalyticsDate,
  isAnalyticsRange,
  isAnalyticsRealtimeParams,
  isAnalyticsResourceIds,
} from "@glaze/contracts";
import { describeError, fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { readArray, readNumber, readRecord, readString } from "../http/parse";
import { runAnalyticsPool } from "./analytics-pool";

const ALL = 2_147_483_647;
const emptyValues: AnalyticsValues = {
  downloads: null,
  purchases: null,
  diamonds: null,
  emeralds: null,
  favorites: null,
  rating: null,
  activeUsers: null,
  refundRate: null,
  playtime: null,
};

/** Normalize month keys or full calendar dates without accepting invalid date overflow */
function periodKey(value: unknown, monthly: boolean): string | null {
  const text = readString(value)?.trim();
  if (!text || !(monthly ? /^(\d{6}|\d{4}-\d{2}|\d{8}|\d{4}-\d{2}-\d{2})$/ : /^(\d{8}|\d{4}-\d{2}-\d{2})$/).test(text))
    return null;
  const raw = text.replaceAll("-", "");
  const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.length === 6 ? "01" : raw.slice(6, 8)}`;
  return isAnalyticsDate(date) ? date.slice(0, monthly ? 7 : 10) : null;
}

/** Find one unambiguous monthly record collection without guessing a wrapper's field name */
function monthlyRows(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) return readArray(value);
  const payload = readRecord(value);
  if (Array.isArray(payload.data)) return readArray(payload.data);

  const candidates: Record<string, unknown>[][] = [];
  let visited = 0;
  let truncated = false;
  const visit = (container: unknown, depth: number): void => {
    if (++visited > 64) {
      truncated = true;
      return;
    }
    if (Array.isArray(container)) {
      // Day records and metadata arrays are not monthly totals. Keep every row in
      // a matching collection so subsequent validation cannot hide malformed rows.
      if (
        container.some((item) => {
          const row = readRecord(item);
          return (
            "iid" in row &&
            "monthid" in row &&
            ["total_diamond", "total_points", "download_num"].some((key) => key in row)
          );
        })
      ) {
        const rows = readArray(container);
        if (rows) candidates.push(rows);
      }
      return;
    }
    if (depth >= 2) return;
    for (const child of Object.values(readRecord(container))) {
      if (child !== null && typeof child === "object") visit(child, depth + 1);
      if (truncated) break;
    }
  };
  visit(value, 0);
  return !truncated && candidates.length === 1 ? (candidates[0] ?? null) : null;
}

/** Describe bounded field structure without scalar values, identifiers or credential keys */
function analyticsPayloadShape(value: unknown): string {
  const type = (part: unknown): string => {
    if (part === undefined) return "缺失";
    if (part === null) return "null";
    if (Array.isArray(part)) return `数组(${part.length})`;
    return (
      ({ object: "对象", string: "字符串", number: "数字", boolean: "布尔值" } as Record<string, string>)[
        typeof part
      ] ?? "其他类型"
    );
  };
  const payload = readRecord(value);
  const nested = readRecord(payload.data);
  const structure = (part: unknown, depth: number): string => {
    if (Array.isArray(part))
      return `${type(part)}${part.length && depth < 2 ? `[${structure(part[0], depth + 1)}]` : ""}`;
    if (!part || typeof part !== "object" || depth >= 2) return type(part);
    const entries = Object.entries(part);
    const fields = entries.slice(0, 8).map(([key, child]) => {
      const safeKey =
        /^[a-z_]{1,40}$/i.test(key) &&
        !/account|secret|token|cookie|password|session|authorization|email|phone|uid|^iid$/i.test(key)
          ? key
          : "隐藏字段";
      return `${safeKey}:${structure(child, depth + 1)}`;
    });
    return `{${fields.join("，")}${entries.length > 8 ? "，…" : ""}}`;
  };
  return `载荷=${type(value)}，data=${type(payload.data)}，data.data=${type(nested.data)}；结构=${structure(value, 0)}`;
}

/** Normalize daily sales and engagement or monthly totals, keeping unavailable metrics distinct from zero */
export function readAnalyticsRecords(value: unknown, monthly = false): Result<AnalyticsRecord[]> {
  const endpoint = monthly ? "data_analysis.month_detail" : "data_analysis.day_detail";
  const label = monthly ? "月汇总" : "日追踪";
  const rows = monthly ? monthlyRows(value) : readArray(readRecord(value).data);
  if (!rows)
    return fail({
      kind: "parse",
      endpoint,
      detail: `${label}未找到唯一可识别的记录数组（${analyticsPayloadShape(value)}）`,
    });
  const records: AnalyticsRecord[] = [];
  const keys = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const resourceId = readString(row.iid);
    const date = periodKey(monthly ? row.monthid : row.dateid, monthly);
    if (!resourceId)
      return fail({ kind: "parse", endpoint, detail: `${label}第 ${index + 1} 条记录缺少 iid 资源标识` });
    if (!date)
      return fail({
        kind: "parse",
        endpoint,
        detail: `${label}第 ${index + 1} 条记录的 ${monthly ? "monthid" : "dateid"} 不是有效${monthly ? "月份" : "日期"}`,
      });
    // Upstream sums monthly rows by month; repeated resource/month pairs are not a schema failure
    if (!monthly && keys.has(`${resourceId}:${date}`))
      return fail({ kind: "parse", endpoint, detail: `${label}第 ${index + 1} 条记录的资源和日期重复` });
    keys.add(`${resourceId}:${date}`);
    records.push({
      resourceId,
      date,
      name: readString(row.res_name) ?? resourceId,
      downloads: readNumber(row.download_num),
      purchases: monthly ? null : readNumber(row.cnt_buy),
      diamonds: readNumber(monthly ? row.total_diamond : row.diamond),
      emeralds: readNumber(monthly ? row.total_points : row.points),
      favorites: monthly ? null : readNumber(row.focus_cnt),
      rating: monthly ? null : readNumber(row.star_adjusted),
      refundRate: monthly ? null : readNumber(row.refund_rate),
      activeUsers: monthly ? null : readNumber(row.DAU),
      playtime: monthly ? null : readNumber(row.avg_playtime),
      peers: monthly
        ? { ...emptyValues }
        : {
            ...emptyValues,
            purchases: readNumber(row.avg_first_type_buy),
            diamonds: readNumber(row.avg_first_type_diamond),
            favorites: readNumber(row.avg_first_type_focus),
          },
    });
  }
  return ok(records.sort((left, right) => left.date.localeCompare(right.date)));
}

/** Daily metrics from one platform, with up to three batches in flight */
export async function getAnalyticsDaily(
  session: NeteaseSession,
  params: AnalyticsDailyParams,
): Promise<Result<AnalyticsRecord[]>> {
  if (
    !isAnalyticsRange(params) ||
    !isAnalyticsResourceIds(params.resourceIds) ||
    (params.platform !== undefined && params.platform !== "pe" && params.platform !== "pc") ||
    (params.includePeers !== undefined && typeof params.includePeers !== "boolean")
  )
    return fail({ kind: "business", code: "invalid_params", message: "分析日期或资源参数无效" });
  const batches = Array.from({ length: Math.ceil(params.resourceIds.length / 20) }, (_, index) =>
    params.resourceIds.slice(index * 20, (index + 1) * 20),
  );
  const results = await runAnalyticsPool(
    batches.map((ids) => async (): Promise<Result<AnalyticsRecord[]>> => {
      const result = await getMcDevData(
        "data_analysis.day_detail",
        withQuery("/data_analysis/day_detail/", {
          platform: params.platform ?? "pe",
          category: params.platform === "pc" ? "comp" : "pe",
          start_date: params.startDate.replaceAll("-", ""),
          end_date: params.endDate.replaceAll("-", ""),
          item_list_str: ids.join(","),
          sort: "dateid",
          order: "ASC",
          start: 0,
          span: ALL,
          is_need_us_rank_data: params.includePeers ?? false,
        }),
        session,
      );
      if (!result.ok) return result;
      const parsed = readAnalyticsRecords(result.value);
      if (!parsed.ok) return parsed;
      const matched = parsed.value.filter(
        (row) => ids.includes(row.resourceId) && row.date >= params.startDate && row.date <= params.endDate,
      );
      if (parsed.value.length > 0 && matched.length === 0) {
        const matchingIds = parsed.value.filter((row) => ids.includes(row.resourceId)).length;
        return fail({
          kind: "business",
          code: "analytics_mismatch",
          message: `平台返回了 ${parsed.value.length} 条日记录，但${matchingIds === 0 ? "资源标识与请求不一致" : "日期不在请求范围内"}，无法绘制。请反馈此提示以核对接口。`,
        });
      }
      return ok(matched);
    }),
    3,
    true,
  );
  const expired = results.find((result) => !result.ok && result.error.kind === "session_expired");
  if (expired && !expired.ok) return expired;
  const records: AnalyticsRecord[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    records.push(...result.value);
  }
  return ok(records);
}

/** Native monthly totals for ordinary PE resources */
export async function getAnalyticsMonthly(
  session: NeteaseSession,
  params: AnalyticsRangeParams,
): Promise<Result<AnalyticsRecord[]>> {
  if (!isAnalyticsRange(params)) return fail({ kind: "business", code: "invalid_params", message: "分析日期范围无效" });
  const result = await getMcDevData(
    "data_analysis.month_detail",
    withQuery("/data_analysis/month_detail/", {
      platform: "pe",
      category: "pe",
      start_date: params.startDate.replaceAll("-", ""),
      end_date: params.endDate.replaceAll("-", ""),
      sort: "monthid",
      order: "DESC",
      start: 0,
      span: ALL,
      day_sort: "cnt_buy",
      day_span: ALL,
      day_dateid: params.endDate.replaceAll("-", ""),
    }),
    session,
    // Match the upstream analysis client's read deadline for the heavier monthly query
    { timeoutMs: 60_000 },
  );
  if (!result.ok) return result;
  // The platform returns an empty object before a monthly aggregate is available
  if (
    result.value !== null &&
    typeof result.value === "object" &&
    !Array.isArray(result.value) &&
    Object.keys(result.value).length === 0
  )
    return fail({ kind: "business", code: "no_monthly_data", message: "平台暂未提供该月份的月汇总数据" });
  const parsed = readAnalyticsRecords(result.value, true);
  return parsed.ok
    ? ok(
        parsed.value.filter(
          (row) => row.date >= params.startDate.slice(0, 7) && row.date <= params.endDate.slice(0, 7),
        ),
      )
    : parsed;
}

/** Platform order totals remain authoritative even when the order list is incomplete */
export function readRealtimeIncome(value: unknown, resourceId: string): Result<AnalyticsResourceIncome> {
  const raw = readRecord(value);
  const diamonds = readNumber(raw.total_diamonds);
  const emeralds = readNumber(raw.total_points);
  const purchases = readNumber(raw.count);
  const rows = readArray(raw.orders);
  const endpoint = "items.pe.incomes";
  if (diamonds === null || emeralds === null || purchases === null) {
    const invalid = [
      diamonds === null && "total_diamonds",
      emeralds === null && "total_points",
      purchases === null && "count",
    ].filter(Boolean);
    return fail({ kind: "parse", endpoint, detail: `收益字段缺失或格式异常: ${invalid.join(", ")}` });
  }
  const orders: AnalyticsOrder[] = [];
  let omittedOrderCount = 0;
  for (const row of rows ?? []) {
    const id = readString(row.app_orderid);
    const time = readString(row.ship_time);
    const currency = readString(row.price_type) ?? "unknown";
    const amount = readNumber(row.price);
    if (!id || !time || amount === null) {
      omittedOrderCount++;
      continue;
    }
    orders.push({ id, resourceId, time, currency, amount, refundStatus: readString(row.refund_status) ?? "" });
  }
  return ok({
    resourceId,
    diamonds,
    emeralds,
    purchases,
    orders,
    omittedOrderCount,
    ordersIncomplete: !rows || omittedOrderCount > 0 || orders.length < purchases,
  });
}

/** Fetch platform totals and orders for an inclusive Beijing date interval, with partial failures */
export async function getAnalyticsRealtime(
  session: NeteaseSession,
  params: AnalyticsRealtimeParams,
): Promise<Result<AnalyticsRealtime>> {
  if (!isAnalyticsRealtimeParams(params))
    return fail({ kind: "business", code: "invalid_params", message: "实时收益日期或资源参数无效" });
  const start = Date.parse(`${params.date}T00:00:00+08:00`);
  const end = Date.parse(`${params.endDate ?? params.date}T00:00:00+08:00`) + 86_400_000 - 1;
  const resources: AnalyticsResourceIncome[] = [];
  const failedResourceIds: string[] = [];
  const failures: NonNullable<AnalyticsRealtime["failures"]> = [];
  const results = await runAnalyticsPool(
    params.resourceIds.map((id) => async () => {
      const result = await getMcDevData(
        "items.pe.incomes",
        withQuery(`/items/categories/pe/${id}/incomes/`, {
          begin_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
        }),
        session,
        { timeoutMs: 60_000 },
      );
      return result.ok ? readRealtimeIncome(result.value, id) : result;
    }),
    4,
    false,
  );
  for (const [index, result] of results.entries()) {
    if (result.ok) resources.push(result.value);
    else if (result.error.kind === "session_expired") return result;
    else {
      const resourceId = params.resourceIds[index] as string;
      failedResourceIds.push(resourceId);
      failures.push({ resourceId, kind: result.error.kind, message: describeError(result.error) });
    }
  }
  return ok({ resources, failedResourceIds, failures, queriedAt: new Date().toISOString() });
}
