import type { AccountParams } from "./developer";

// Income estimate capability. The estimate is computed in the main process; the UI only displays it

export interface IncomeEstimateParams extends AccountParams {
  /** Calendar month as "YYYY-MM"; omit for the current month */
  month?: string | undefined;
}

export interface IncomeEstimate {
  /** "YYYY-MM" */
  month: string;
  /** First and last day of the sales window counted for this month, "YYYY-MM-DD" */
  startDate: string;
  endDate: string;
  /** Diamonds sold in the window after refunds */
  diamonds: number;
  /** Gross sales in yuan */
  diamondIncomeYuan: number;
  /** Developer share in yuan after the platform fee */
  developerShareYuan: number;
  /** Incentive subsidies in yuan (per-work and total-sales tiers) */
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
