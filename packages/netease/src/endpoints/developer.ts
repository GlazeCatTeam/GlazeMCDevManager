import type { AnalyticsOverview, ContributionScore, DeveloperLevel } from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession } from "../http/client";
import { readNumber, readRecord, readString } from "../http/parse";

/** One contribution score from the level payload; null when the account has none this month */
function readContribution(raw: Record<string, unknown>, prefix: string): ContributionScore | null {
  const score = readString(raw[`${prefix}_score`]);
  const rank = readNumber(raw[`${prefix}_rank`]);
  const grade = readNumber(raw[`${prefix}_class`]);
  if (score === null || rank === null || grade === null) {
    return null;
  }
  return { score, rank, grade };
}

/** Developer level, class, experience range and monthly contribution from GET /new_level/ */
export async function getDeveloperLevel(session: NeteaseSession): Promise<Result<DeveloperLevel>> {
  const result = await getMcDevData("new_level", "/new_level/", session);
  if (!result.ok) {
    return result;
  }
  const raw = readRecord(result.value);
  const level = readNumber(raw.current_level);
  const expFloor = readNumber(raw.exp_floor);
  const expCeiling = readNumber(raw.exp_ceiling);
  const totalExp = readNumber(raw.total_exp);
  if (level === null || expFloor === null || expCeiling === null || totalExp === null) {
    return fail({ kind: "parse", endpoint: "new_level" });
  }
  return ok({
    level,
    levelClass: readNumber(raw.current_class) ?? 0,
    expFloor,
    expCeiling,
    totalExp,
    upgradeClassAchieve: raw.upgrade_class_achieve === true,
    contributionMonth: readString(raw.contribution_month),
    contribution: readContribution(raw, "contribution"),
    netGameContribution: readContribution(raw, "contribution_netgame"),
  });
}

const overviewFields = {
  thisMonthDiamond: "this_month_diamond",
  lastMonthDiamond: "last_month_diamond",
  thisMonthDownload: "this_month_download",
  lastMonthDownload: "last_month_download",
  yesterdayDiamond: "yesterday_diamond",
  days14AverageDiamond: "days_14_average_diamond",
  yesterdayDownload: "yesterday_download",
  days14AverageDownload: "days_14_average_download",
} as const satisfies Record<keyof AnalyticsOverview, string>;

/** Account-wide diamonds and downloads from GET /data_analysis/overview/ */
export async function getAnalyticsOverview(session: NeteaseSession): Promise<Result<AnalyticsOverview>> {
  const result = await getMcDevData("data_analysis.overview", "/data_analysis/overview/", session);
  if (!result.ok) {
    return result;
  }
  const raw = readRecord(result.value);
  const overview: Partial<AnalyticsOverview> = {};
  for (const [key, field] of Object.entries(overviewFields) as [keyof AnalyticsOverview, string][]) {
    const value = readNumber(raw[field]);
    if (value === null) {
      return fail({ kind: "parse", endpoint: "data_analysis.overview" });
    }
    overview[key] = value;
  }
  return ok(overview as AnalyticsOverview);
}
