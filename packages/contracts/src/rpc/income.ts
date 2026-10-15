import type { AccountParams } from "./developer";

export type IncomePlatform = "pe" | "pc";

export interface IncomeListParams extends AccountParams {
  platform: IncomePlatform;
}

export interface IncomeDetailParams extends AccountParams {
  id: string;
}

export interface IncomeCarryover {
  month: string;
  incomeYuan: number | null;
}

export interface IncomeRecord {
  /** Actual channel/IP cost divided by diamond turnover, when the bill provides usable fields */
  platformCostRate?: number;
  id: string;
  month: string;
  platform: IncomePlatform;
  status: string;
  incomeYuan: number | null;
  incentiveYuan: number | null;
  playPlanYuan: number | null;
  taxYuan: number | null;
  serviceFeeYuan: number | null;
  usageFeeYuan: number | null;
  /** Income less tax, service fee and usage fee; null if any component is unavailable */
  netYuan: number | null;
  /** Platform-provided available settlement amount; may include previous months, never sum across rows */
  availableYuan: number | null;
  diamonds: number | null;
  operatedAt: string | null;
  carryover: IncomeCarryover[] | null;
}

export interface IncomeList {
  records: IncomeRecord[];
  total: number;
  incomeYuan: number | null;
  netYuan: number | null;
  paidYuan: number | null;
  unsettledCount: number;
}

export interface IncomeDetail extends IncomeRecord {
  settlementType: string | null;
  adjustmentYuan: number | null;
  advertisingYuan: number | null;
}

export const incomeStatusLabels: Record<string, string> = {
  init: "未结算",
  fail: "结算失败",
  applying: "结算中",
  pay_success: "已打款",
  pay_fail: "打款失败",
  need_modify: "结算信息待更正",
};

/** Accept only a supported platform and an optional explicit account */
export function isIncomeListParams(value: unknown): value is IncomeListParams {
  if (!value || typeof value !== "object") return false;
  const params = value as Partial<IncomeListParams>;
  return (
    (params.platform === "pe" || params.platform === "pc") &&
    (params.account === undefined || (typeof params.account === "string" && params.account.length > 0))
  );
}

/** Reject path fragments and unsafe identifiers before requesting settlement details */
export function isIncomeDetailParams(value: unknown): value is IncomeDetailParams {
  if (!value || typeof value !== "object") return false;
  const params = value as Partial<IncomeDetailParams>;
  return (
    typeof params.id === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(params.id) &&
    (params.account === undefined || (typeof params.account === "string" && params.account.length > 0))
  );
}

// Income estimate capability. The estimate is computed in the main process; the UI only displays it

export interface IncomeEstimateParams extends AccountParams {
  /** Calendar month as "YYYY-MM"; omit for the current month */
  month?: string | undefined;
}

export interface IncomeEstimate {
  /** Period-only inputs: authoritative month totals or provisional returned daily sales */
  source?: "pe-monthly" | "pe-period-daily";
  costRate?: number;
  costSourceMonth?: string | null;
  warnings?: string[];
  /** "YYYY-MM" */
  month: string;
  /** Data query bounds; monthly-source estimates do not assert settlement-day boundaries */
  startDate: string;
  endDate: string;
  /** Sales diamonds: homepage uses refunded daily sales; pe-monthly uses native monthly totals */
  diamonds: number;
  /** Gross sales in yuan */
  diamondIncomeYuan: number;
  /** Developer share in yuan after the platform fee */
  developerShareYuan: number;
  /** Flat bonuses on the homepage; includes proportional incentives for pe-monthly estimates */
  subsidyYuan: number;
  /** Developer share plus subsidies */
  totalYuan: number;
  taxYuan: number;
  afterTaxYuan: number;
  /** Works whose sales were counted */
  works: number;
  /** Names of works whose sales query failed; the totals are incomplete when non-empty */
  failedWorks: string[];
}
