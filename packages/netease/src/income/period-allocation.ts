import type { AnalyticsIncomeAllocation } from "@glaze/contracts";
import { estimatePePeriodProfit } from "./period-rules";

export interface PeriodSales {
  resourceId: string;
  name: string;
  diamonds: number;
}

/** Reject misaligned allocation arrays rather than silently losing cents */
function at(values: number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new RangeError("Allocation index missing");
  return value;
}

/** Allocate integer cents by largest remainder; input order is a stable resource-id order */
function distribute(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("Invalid allocation total");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!total) return weights.map(() => 0);
  if (!Number.isFinite(sum) || sum <= 0) throw new RangeError("Missing allocation weights");
  const shares = weights.map((weight) => total * (weight / sum));
  const cents = shares.map(Math.floor);
  const remainder = total - cents.reduce((a, b) => a + b, 0);
  if (remainder < 0 || remainder > weights.length) throw new RangeError("Allocation precision exceeded");
  const order = shares
    .map((value, index) => ({ index, fraction: value - at(cents, index) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order.slice(0, remainder)) cents[index] = at(cents, index) + 1;
  return cents;
}

/** Compute PE once, award limited bonuses once, then allocate account bonuses and tax without losing cents */
export function allocatePePeriodIncome(input: PeriodSales[], costRate: number) {
  const rows = [...input].sort((a, b) => (a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0));
  if (new Set(rows.map((row) => row.resourceId)).size !== rows.length) throw new Error("Duplicate allocation resource");
  const profit = estimatePePeriodProfit(
    rows.map((row) => row.diamonds),
    costRate,
  );
  const diamonds = profit.diamonds;
  const rate =
    diamonds < 100000 ? 0.5 : diamonds < 300000 ? 0.3 : diamonds < 500000 ? 0.2 : diamonds < 1000000 ? 0.1 : 0;
  const workBonus = rows.map(() => 0);
  if (diamonds < 50_000_000) {
    const used = [0, 0, 0, 0, 0, 0];
    const awards = [0, 100, 500, 1000, 3000, 5000];
    const ranked = rows
      .map((row, index) => ({ ...row, index }))
      .sort((a, b) => b.diamonds - a.diamonds || a.index - b.index);
    for (const row of ranked) {
      const d = row.diamonds;
      let level = d < 100000 ? 0 : d < 500000 ? 1 : d < 1000000 ? 2 : d < 3000000 ? 3 : d < 5000000 ? 4 : 5;
      while (level > 0 && at(used, level) >= 3) level--;
      if (level) {
        used[level] = at(used, level) + 1;
        workBonus[row.index] = at(awards, level);
      }
    }
  }
  const accountBonus =
    diamonds >= 1000000 && diamonds < 5000000 ? 200 : diamonds >= 5000000 && diamonds < 10000000 ? 1000 : 0;
  const baseWeights = rows.map(
    (row) =>
      (row.diamonds * (1 - costRate) * (row.diamonds < 1000000 ? 0.5 : row.diamonds < 10000000 ? 0.525 : 0.55)) / 100,
  );
  const subsidyWeights = rows.map(
    (row, index) =>
      (row.diamonds * (1 - costRate) * rate) / 100 +
      at(workBonus, index) +
      (diamonds ? (accountBonus * row.diamonds) / diamonds : 0),
  );
  const totalCents = Math.round(profit.totalYuan * 100);
  const baseCents = Math.round(profit.developerShareYuan * 100);
  const taxCents = Math.round(profit.taxYuan * 100);
  const bases = distribute(baseCents, baseWeights);
  const subsidies = distribute(totalCents - baseCents, subsidyWeights);
  const gross = rows.map((_, index) => at(bases, index) + at(subsidies, index));
  const taxes = distribute(taxCents, gross);
  const allocations: AnalyticsIncomeAllocation[] = rows.map((row, index) => ({
    ...row,
    developerShareYuan: at(bases, index) / 100,
    subsidyYuan: at(subsidies, index) / 100,
    totalYuan: at(gross, index) / 100,
    taxYuan: at(taxes, index) / 100,
    afterTaxYuan: (at(gross, index) - at(taxes, index)) / 100,
  }));
  return {
    ...profit,
    diamondIncomeYuan: Math.round(profit.diamondIncomeYuan * 100) / 100,
    developerShareYuan: baseCents / 100,
    subsidyYuan: (totalCents - baseCents) / 100,
    totalYuan: totalCents / 100,
    taxYuan: taxCents / 100,
    afterTaxYuan: (totalCents - taxCents) / 100,
    allocations,
  };
}
