import type { AnalyticsRealtime } from "@glaze/plugin-sdk";

/** Replace only the requested resources so a targeted retry retains successful totals */
export function mergeRealtimeIncome(previous: AnalyticsRealtime | null, incoming: AnalyticsRealtime, requestedIds: string[]): AnalyticsRealtime {
  const requested = new Set(requestedIds);
  return {
    resources: [...(previous?.resources ?? []).filter((row) => !requested.has(row.resourceId)), ...incoming.resources],
    failedResourceIds: [...(previous?.failedResourceIds ?? []).filter((id) => !requested.has(id)), ...incoming.failedResourceIds],
    failures: [...(previous?.failures ?? []).filter((row) => !requested.has(row.resourceId)), ...(incoming.failures ?? [])],
    ...(incoming.queriedAt ? { queriedAt: incoming.queriedAt } : {}),
  };
}
