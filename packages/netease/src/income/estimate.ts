import type { IncomeEstimate } from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { readArray, readNumber, readRecord, readString } from "../http/parse";
import { estimateProfit } from "./rules";

/** Works per day-detail request; a failed batch marks only its own works as failed */
const BATCH_SIZE = 20;
/** Prerequisite (前置) mods are free and never sell */
const PREREQUISITE_PRI_TYPE = 9;
const ALL = 2_147_483_647;

interface Work {
  id: string;
  name: string;
}

/** "YYYY-MM" to the year and zero-based month, or null when malformed */
export function parseMonth(month: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return null;
  }
  const value = { year: Number(match[1]), month: Number(match[2]) - 1 };
  return value.month >= 0 && value.month < 12 ? value : null;
}

/** "YYYY-MM" of a date in local time */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Date as yyyyMMdd for the analysis API */
function compactDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

/** Date as YYYY-MM-DD for display */
function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Sales window counted for a settlement month: from 9 days before its first day to 10 days before
 * the next month's first day, e.g. 2026-10 covers 2026-09-22 to 2026-10-22
 */
export function settlementWindow(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(year, month, 1 - 9), end: new Date(year, month + 1, 1 - 10) };
}

/** Round a yuan amount to cents */
function cents(yuan: number): number {
  return Math.round(yuan * 100) / 100;
}

/** Split a list into batches of at most `size` */
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** All mobile works that can sell, from GET /items/categories/pe/ */
async function listSellableWorks(session: NeteaseSession): Promise<Result<Work[]>> {
  const result = await getMcDevData("items.pe", withQuery("/items/categories/pe/", { start: 0, span: ALL }), session);
  if (!result.ok) {
    return result;
  }
  const rows = readArray(readRecord(result.value).item);
  if (rows === null) {
    return fail({ kind: "parse", endpoint: "items.pe" });
  }
  const works: Work[] = [];
  for (const row of rows) {
    const id = readString(row.item_id);
    if (id !== null && readNumber(row.pri_type) !== PREREQUISITE_PRI_TYPE) {
      works.push({ id, name: readString(row.item_name) ?? id });
    }
  }
  return ok(works);
}

/** Diamonds after refunds per work id for one batch of ordinary works */
async function batchSales(
  session: NeteaseSession,
  works: Work[],
  start: string,
  end: string,
): Promise<Result<Map<string, number>>> {
  const path = withQuery("/data_analysis/day_detail/", {
    platform: "pe",
    category: "pe",
    start_date: start,
    end_date: end,
    item_list_str: works.map((work) => work.id).join(","),
    sort: "dateid",
    order: "ASC",
    start: 0,
    span: ALL,
    is_need_us_rank_data: false,
  });
  const result = await getMcDevData("data_analysis.day_detail", path, session);
  if (!result.ok) {
    return result;
  }
  const rows = readArray(readRecord(result.value).data);
  if (rows === null) {
    return fail({ kind: "parse", endpoint: "data_analysis.day_detail" });
  }
  const sales = new Map<string, number>();
  for (const row of rows) {
    const id = readString(row.iid);
    const diamond = readNumber(row.diamond) ?? 0;
    const refundRate = readNumber(row.refund_rate) ?? 0;
    if (id !== null) {
      sales.set(id, (sales.get(id) ?? 0) + diamond * (1 - refundRate));
    }
  }
  return ok(sales);
}

/** Diamonds per lobby (联机大厅) work: its goods' sales summed under the owning work */
async function lobbySales(session: NeteaseSession, start: string, end: string): Promise<Result<Map<string, number>>> {
  const summary = await getMcDevData("goods.summary", withQuery("/goods/pe/summary", { start: 0, span: ALL }), session);
  if (!summary.ok) {
    return summary;
  }
  const lobbyWorks = readArray(readRecord(summary.value).items) ?? [];
  const ownerOfGoods = new Map<string, string>();
  for (const work of lobbyWorks) {
    const workId = readString(work.item_id);
    if (workId === null) {
      continue;
    }
    const goods = await getMcDevData("goods.list", `/goods/pe/${encodeURIComponent(workId)}/`, session);
    if (!goods.ok) {
      return goods;
    }
    for (const good of readArray(readRecord(goods.value).goods) ?? []) {
      const goodsId = readString(good.goods_id);
      if (goodsId !== null) {
        ownerOfGoods.set(goodsId, workId);
      }
    }
  }

  const sales = new Map<string, number>();
  if (ownerOfGoods.size === 0) {
    return ok(sales);
  }
  const path = withQuery("/data_analysis/goods/day_detail/", {
    platform: "pe",
    category: "pe",
    start_date: start,
    end_date: end,
    item_list_str: [...ownerOfGoods.keys()].join(","),
    start: 0,
    span: ALL,
    is_need_us_rank_data: false,
    mc_type: "1",
  });
  const detail = await getMcDevData("data_analysis.goods_day_detail", path, session);
  if (!detail.ok) {
    return detail;
  }
  for (const row of readArray(readRecord(detail.value).data) ?? []) {
    const owner = ownerOfGoods.get(readString(row.iid) ?? "");
    if (owner !== undefined) {
      sales.set(owner, (sales.get(owner) ?? 0) + (readNumber(row.diamond) ?? 0));
    }
  }
  return ok(sales);
}

/**
 * Estimate a settlement month's income from every work's sales in its window. Failed batches are
 * reported by work name instead of being counted as zero; listing works must succeed
 */
export async function estimateIncome(session: NeteaseSession, month: string): Promise<Result<IncomeEstimate>> {
  const parsed = parseMonth(month);
  if (!parsed) {
    return fail({ kind: "business", code: "invalid_month", message: "月份格式应为 YYYY-MM" });
  }
  const window = settlementWindow(parsed.year, parsed.month);
  const start = compactDate(window.start);
  const end = compactDate(window.end);

  const works = await listSellableWorks(session);
  if (!works.ok) {
    return works;
  }
  const sales = new Map<string, number>();
  const failedWorks: string[] = [];
  const batches = chunk(works.value, BATCH_SIZE);
  const results = await Promise.all(batches.map((batch) => batchSales(session, batch, start, end)));
  for (const [index, result] of results.entries()) {
    if (!result.ok) {
      if (result.error.kind === "session_expired") {
        return result;
      }
      failedWorks.push(...(batches[index] ?? []).map((work) => work.name));
      continue;
    }
    for (const [id, amount] of result.value) {
      sales.set(id, (sales.get(id) ?? 0) + amount);
    }
  }

  const countedWorks = works.value.length - failedWorks.length;
  const lobby = await lobbySales(session, start, end);
  if (!lobby.ok) {
    if (lobby.error.kind === "session_expired") {
      return lobby;
    }
    failedWorks.push("联机大厅作品");
  } else {
    for (const [id, amount] of lobby.value) {
      sales.set(id, (sales.get(id) ?? 0) + amount);
    }
  }

  const profit = estimateProfit([...sales.values()]);
  return ok({
    month,
    startDate: isoDate(window.start),
    endDate: isoDate(window.end),
    diamonds: Math.round(profit.diamonds),
    diamondIncomeYuan: cents(profit.diamondIncomeYuan),
    developerShareYuan: cents(profit.developerShareYuan),
    subsidyYuan: cents(profit.subsidyYuan),
    totalYuan: cents(profit.totalYuan),
    taxYuan: cents(profit.taxYuan),
    afterTaxYuan: cents(profit.afterTaxYuan),
    works: countedWorks,
    failedWorks,
  });
}
