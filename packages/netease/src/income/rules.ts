// NetEase revenue-share and incentive rules for estimating a month's income. Amounts are in
// diamonds until the final conversion; 100 diamonds of sales count as 1 yuan.
// These follow the platform's published rules as the reference client applies them; they are
// an estimate, and the settlement record is authoritative

const DIAMONDS_PER_YUAN = 100;
/** Share of sales left after the platform's technical service fee */
const AFTER_PLATFORM_FEE = 0.7;
/** At or above this total, no subsidies apply */
const NO_SUBSIDY_TOTAL = 50_000_000;

/** [upper bound exclusive, value]; the first bound the amount is below wins */
type Tiers = readonly (readonly [number, number])[];

/** Developer's base share of a work's sales after the platform fee, by the work's own sales */
const baseShareTiers: Tiers = [
  [1_000_000, 0.5],
  [10_000_000, 0.525],
  [Number.POSITIVE_INFINITY, 0.55],
];

/** Part of the non-developer share returned as subsidy, by the account's total sales */
const subsidyRateTiers: Tiers = [
  [100_000, 0.5],
  [300_000, 0.3],
  [500_000, 0.2],
  [1_000_000, 0.1],
  [Number.POSITIVE_INFINITY, 0],
];

/** Flat bonus in yuan by the account's total sales */
const totalBonusTiers: Tiers = [
  [1_000_000, 0],
  [5_000_000, 200],
  [10_000_000, 1000],
  [Number.POSITIVE_INFINITY, 0],
];

/** Per-work incentive level by the work's sales; level 0 pays nothing */
const workLevelTiers: Tiers = [
  [100_000, 0],
  [500_000, 1],
  [1_000_000, 2],
  [3_000_000, 3],
  [5_000_000, 4],
  [NO_SUBSIDY_TOTAL, 5],
];
/** Yuan paid per work at each incentive level, index = level */
const workLevelYuan = [0, 100, 500, 1000, 3000, 5000];
/** Each incentive level pays at most this many works; the rest drop to a lower level */
const WORKS_PER_LEVEL = 3;

/** Value of the first tier whose bound the amount is below */
function tier(tiers: Tiers, amount: number): number {
  for (const [bound, value] of tiers) {
    if (amount < bound) {
      return value;
    }
  }
  return 0;
}

/** Per-work incentives in yuan: best sellers claim levels first, at most three works per level */
function workIncentivesYuan(sales: number[]): number {
  const taken = new Array<number>(workLevelYuan.length).fill(0);
  let yuan = 0;
  for (const amount of [...sales].sort((a, b) => b - a)) {
    let level = tier(workLevelTiers, amount);
    while (level > 0 && (taken[level] ?? 0) >= WORKS_PER_LEVEL) {
      level -= 1;
    }
    if (level > 0) {
      taken[level] = (taken[level] ?? 0) + 1;
      yuan += workLevelYuan[level] ?? 0;
    }
  }
  return yuan;
}

/** Personal income tax on a payout in yuan, as for remuneration income */
export function incomeTax(yuan: number): number {
  if (yuan < 800) {
    return 0;
  }
  if (yuan < 4000) {
    return (yuan - 800) * 0.2;
  }
  return yuan * 0.8 * 0.2;
}

export interface ProfitBreakdown {
  diamonds: number;
  diamondIncomeYuan: number;
  developerShareYuan: number;
  subsidyYuan: number;
  totalYuan: number;
  taxYuan: number;
  afterTaxYuan: number;
}

/** Estimate a month's payout from each work's diamond sales in the selected window */
export function estimateProfit(salesByWork: number[]): ProfitBreakdown {
  const sales = salesByWork.filter((amount) => amount > 0);
  const diamonds = sales.reduce((sum, amount) => sum + amount, 0);
  const subsidyRate = diamonds >= NO_SUBSIDY_TOTAL ? 0 : tier(subsidyRateTiers, diamonds);

  let developerDiamonds = 0;
  for (const amount of sales) {
    const base = tier(baseShareTiers, amount);
    developerDiamonds += amount * AFTER_PLATFORM_FEE * (base + (1 - base) * subsidyRate);
  }
  const developerShareYuan = developerDiamonds / DIAMONDS_PER_YUAN;
  const subsidyYuan = diamonds >= NO_SUBSIDY_TOTAL ? 0 : workIncentivesYuan(sales) + tier(totalBonusTiers, diamonds);
  const totalYuan = developerShareYuan + subsidyYuan;
  const taxYuan = incomeTax(totalYuan);

  return {
    diamonds,
    diamondIncomeYuan: diamonds / DIAMONDS_PER_YUAN,
    developerShareYuan,
    subsidyYuan,
    totalYuan,
    taxYuan,
    afterTaxYuan: totalYuan - taxYuan,
  };
}
