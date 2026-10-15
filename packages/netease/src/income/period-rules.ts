import { estimateProfit, incomeTax, type ProfitBreakdown } from "./rules";

/** PE period candidate: incentives use all post-cost turnover; homepage rules stay unchanged */
export function estimatePePeriodProfit(salesByWork: number[], costRate: number): ProfitBreakdown {
  if (!Number.isFinite(costRate) || costRate < 0 || costRate > 1) throw new RangeError("Invalid platform cost rate");
  if (salesByWork.some((amount) => !Number.isFinite(amount) || amount < 0))
    throw new RangeError("Invalid monthly sales");
  const sales = salesByWork.filter((amount) => amount > 0);
  // Reuse only the original per-work and account flat bonuses, not its proportional incentive
  const flatBonuses = estimateProfit(sales).subsidyYuan;
  const diamonds = sales.reduce((sum, amount) => sum + amount, 0);
  const incentiveRate =
    diamonds < 100_000 ? 0.5 : diamonds < 300_000 ? 0.3 : diamonds < 500_000 ? 0.2 : diamonds < 1_000_000 ? 0.1 : 0;
  const developerShareYuan = sales.reduce((sum, amount) => {
    const baseShare = amount < 1_000_000 ? 0.5 : amount < 10_000_000 ? 0.525 : 0.55;
    return sum + (amount * (1 - costRate) * baseShare) / 100;
  }, 0);
  const subsidyYuan = (diamonds * (1 - costRate) * incentiveRate) / 100 + flatBonuses;
  const totalYuan = developerShareYuan + subsidyYuan;
  const taxYuan = incomeTax(totalYuan);
  return {
    diamonds,
    diamondIncomeYuan: diamonds / 100,
    developerShareYuan,
    subsidyYuan,
    totalYuan,
    taxYuan,
    afterTaxYuan: totalYuan - taxYuan,
  };
}
