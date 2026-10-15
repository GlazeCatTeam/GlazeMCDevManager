import {
  type AnalyticsPeriodIncome,
  type AnalyticsPeriodIncomeParams,
  isAnalyticsRange,
  isAnalyticsResourceIds,
} from "@glaze/contracts";
import { getAnalyticsDaily } from "../endpoints/analytics";
import { listWorks } from "../endpoints/works";
import { describeError, fail, ok, type Result } from "../errors";
import type { NeteaseSession } from "../http/client";
import { estimatePePeriodIncome, estimatePeProvisionalIncome, parseMonth } from "./period-estimate";

/** Preserve daily charts while using the PE period-only monthly candidate; PC never invokes it */
export async function getAnalyticsPeriodIncome(
  session: NeteaseSession,
  params: AnalyticsPeriodIncomeParams,
  now = new Date(),
): Promise<Result<AnalyticsPeriodIncome>> {
  const month = params.settlementMonth ?? params.endDate?.slice(0, 7);
  if (
    !isAnalyticsRange(params) ||
    !isAnalyticsResourceIds(params.resourceIds) ||
    !parseMonth(month) ||
    (params.platform !== undefined && params.platform !== "pe" && params.platform !== "pc") ||
    (params.allResources !== undefined && typeof params.allResources !== "boolean")
  )
    return fail({ kind: "business", code: "invalid_params", message: "周期收益月份、平台或资源参数无效" });
  const daily = await getAnalyticsDaily(session, { ...params, includePeers: false });
  if (!daily.ok) return daily;
  if (params.platform === "pc") return ok({ records: daily.value, estimate: null });
  let estimate = await estimatePePeriodIncome(session, month);
  if (!estimate.ok && estimate.error.kind === "session_expired") return estimate;
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  // Never hide historical missing totals, malformed responses, transport failures or expired sessions
  if (
    !estimate.ok &&
    estimate.error.kind === "business" &&
    estimate.error.code === "no_monthly_data" &&
    month >= today.slice(0, 7) &&
    params.endDate < today
  ) {
    // A selected module cannot change account incentives or taxes: obtain every available PE work
    const works = await listWorks(session);
    if (!works.ok && works.error.kind === "session_expired") return works;
    if (!works.ok) estimate = works;
    else {
      const missingIds = works.value
        .filter(
          (work) =>
            !work.isPrerequisite &&
            work.onlineTime &&
            work.onlineTime !== "UNKNOWN" &&
            !params.resourceIds.includes(work.itemId),
        )
        .map((work) => work.itemId);
      const extra = await getAnalyticsDaily(session, { ...params, resourceIds: missingIds, includePeers: false });
      if (!extra.ok && extra.error.kind === "session_expired") return extra;
      if (!extra.ok) estimate = extra;
      else
        estimate = await estimatePeProvisionalIncome(session, month, params.startDate, params.endDate, [
          ...daily.value,
          ...extra.value,
        ]);
    }
  }
  if (!estimate.ok && estimate.error.kind === "session_expired") return estimate;
  return ok({
    records: daily.value,
    estimate: estimate.ok ? estimate.value : null,
    ...(estimate.ok ? {} : { estimateError: describeError(estimate.error) }),
  });
}
