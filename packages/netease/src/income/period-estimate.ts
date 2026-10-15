import type { AnalyticsPeriodEstimate, AnalyticsRecord } from "@glaze/contracts";
import { getAnalyticsMonthly } from "../endpoints/analytics";
import { getIncomeDetail, getIncomeList } from "../endpoints/income";
import { describeError, fail, ok, type Result } from "../errors";
import type { NeteaseSession } from "../http/client";
import { allocatePePeriodIncome, type PeriodSales } from "./period-allocation";

/** Validate a platform settlement-month label */
export function parseMonth(month: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null;
}

/** Query bounds for a month label, not a claimed settlement sales window */
export function calendarMonthWindow(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 0)) };
}

interface CostReference {
  rate: number;
  month: string | null;
  warnings: string[];
}

/** Use only paid PE bills before the requested month; bound legacy detail lookups */
async function previousCost(session: NeteaseSession, month: string): Promise<Result<CostReference>> {
  const fallback = (reason: string) => ok({ rate: 0.3, month: null, warnings: [`${reason}，暂按30%成本估算`] });
  const bills = await getIncomeList(session, { platform: "pe" });
  if (!bills.ok)
    return bills.error.kind === "session_expired" ? bills : fallback(`历史成本查询失败：${describeError(bills.error)}`);
  const candidates = bills.value.records.filter((row) => row.month < month && row.status === "pay_success");
  for (const bill of candidates.slice(0, 12)) {
    if (bill.platformCostRate !== undefined)
      return ok({ rate: bill.platformCostRate, month: bill.month, warnings: [] });
    const detail = await getIncomeDetail(session, { id: bill.id });
    if (!detail.ok)
      return detail.error.kind === "session_expired"
        ? detail
        : fallback(`历史成本详情查询失败：${describeError(detail.error)}`);
    if (detail.value.platform !== "pe" || detail.value.month !== bill.month || detail.value.status !== "pay_success")
      return fallback("历史账单范围不一致");
    if (detail.value.platformCostRate !== undefined)
      return ok({ rate: detail.value.platformCostRate, month: bill.month, warnings: [] });
  }
  return fallback("最近12期内没有可用的已结算成本率");
}

/** Always estimate and allocate the full PE monthly account, including historical resources */
export async function estimatePePeriodIncome(
  session: NeteaseSession,
  month: string,
): Promise<Result<AnalyticsPeriodEstimate>> {
  const parsed = parseMonth(month);
  if (!parsed) return fail({ kind: "business", code: "invalid_params", message: "估算月份或资源参数无效" });
  const window = calendarMonthWindow(parsed.year, parsed.month);
  const startDate = window.start.toISOString().slice(0, 10);
  const endDate = window.end.toISOString().slice(0, 10);
  const monthly = await getAnalyticsMonthly(session, { startDate, endDate });
  if (!monthly.ok) return monthly;
  const selected = monthly.value;
  if (!selected.length)
    return fail({
      kind: "business",
      code: "no_monthly_data",
      message: `${month} PE平台月汇总尚未提供所选范围的完整记录，暂不能估算`,
    });
  if (selected.some((row) => row.diamonds === null || !Number.isFinite(row.diamonds) || row.diamonds < 0))
    return fail({
      kind: "parse",
      endpoint: "data_analysis.month_detail",
      detail: "月汇总钻石字段缺失或无效，不能估算",
    });
  const sales = new Map<string, PeriodSales>();
  for (const row of selected)
    sales.set(row.resourceId, {
      resourceId: row.resourceId,
      name: row.name,
      diamonds: (sales.get(row.resourceId)?.diamonds ?? 0) + (row.diamonds as number),
    });
  const cost = await previousCost(session, month);
  if (!cost.ok) return cost;
  const profit = allocatePePeriodIncome([...sales.values()], cost.value.rate);
  const cents = (value: number) => Math.round(value * 100) / 100;
  return ok({
    month,
    startDate,
    endDate,
    source: "pe-monthly",
    costRate: cost.value.rate,
    costSourceMonth: cost.value.month,
    warnings: cost.value.warnings,
    allocations: profit.allocations,
    diamonds: profit.diamonds,
    diamondIncomeYuan: cents(profit.diamondIncomeYuan),
    developerShareYuan: cents(profit.developerShareYuan),
    subsidyYuan: cents(profit.subsidyYuan),
    totalYuan: cents(profit.totalYuan),
    taxYuan: cents(profit.taxYuan),
    afterTaxYuan: cents(profit.afterTaxYuan),
    works: sales.size,
    failedWorks: [],
  });
}

/** Estimate an unfinished PE cycle from returned daily sales only while month totals are unavailable */
export async function estimatePeProvisionalIncome(
  session: NeteaseSession,
  month: string,
  startDate: string,
  endDate: string,
  records: AnalyticsRecord[],
): Promise<Result<AnalyticsPeriodEstimate>> {
  if (
    !records.length ||
    records.some(
      (row) =>
        row.diamonds === null ||
        !Number.isFinite(row.diamonds) ||
        row.diamonds < 0 ||
        !Number.isFinite(row.refundRate ?? 0) ||
        (row.refundRate ?? 0) < 0 ||
        (row.refundRate ?? 0) > 1,
    )
  )
    return fail({
      kind: "business",
      code: "no_daily_estimate",
      message: "月汇总暂未提供，日记录缺少有效销量或退款数据，暂不能估算",
    });
  const sales = new Map<string, PeriodSales>();
  for (const row of records)
    sales.set(row.resourceId, {
      resourceId: row.resourceId,
      name: row.name,
      diamonds: (sales.get(row.resourceId)?.diamonds ?? 0) + (row.diamonds as number) * (1 - (row.refundRate ?? 0)),
    });
  const cost = await previousCost(session, month);
  if (!cost.ok) return cost;
  const profit = allocatePePeriodIncome([...sales.values()], cost.value.rate);
  const cents = (value: number) => Math.round(value * 100) / 100;
  return ok({
    ...profit,
    developerShareYuan: cents(profit.developerShareYuan),
    subsidyYuan: cents(profit.subsidyYuan),
    totalYuan: cents(profit.totalYuan),
    taxYuan: cents(profit.taxYuan),
    afterTaxYuan: cents(profit.afterTaxYuan),
    diamondIncomeYuan: cents(profit.diamondIncomeYuan),
    month,
    startDate,
    endDate,
    source: "pe-period-daily",
    costRate: cost.value.rate,
    costSourceMonth: cost.value.month,
    works: sales.size,
    failedWorks: [],
    warnings: [
      "平台月汇总尚未提供，暂按账号可查询PE资源的已返回日记录统一估算，缺失记录未补零。月汇总可用后优先采用月汇总。",
      ...cost.value.warnings,
    ],
  });
}
