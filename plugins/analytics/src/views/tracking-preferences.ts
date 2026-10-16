import { type DayRange, type Metric, metrics } from "../data";

export interface TrackingPreferences {
  resourceIds: string[] | null;
  days: DayRange;
  metric: Metric;
  chartKind: "line" | "bar";
}

/** Keep comparison preferences stable across logins, independently for each account */
function storageKey(accountId: string): string {
  return `glaze:analytics:tracking:v1:${accountId}`;
}

/** Restore validated choices, preserving both an empty selection and automatic Top 10 */
export function readTrackingPreferences(accountId: string | undefined, initialIds: string[]): TrackingPreferences {
  const defaults: TrackingPreferences = { resourceIds: initialIds, days: 14, metric: "purchases", chartKind: "line" };
  if (!accountId) return defaults;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey(accountId)) ?? "null");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
    const value = stored as Record<string, unknown>;
    return {
      resourceIds:
        value.resourceIds === null
          ? null
          : Array.isArray(value.resourceIds) && value.resourceIds.every((id) => typeof id === "string")
            ? [...new Set<string>(value.resourceIds)]
            : defaults.resourceIds,
      days: value.days === 7 || value.days === 14 || value.days === 30 ? value.days : defaults.days,
      metric: metrics.find((item) => item.id === value.metric)?.id ?? defaults.metric,
      chartKind: value.chartKind === "bar" ? "bar" : "line",
    };
  } catch {
    return defaults;
  }
}

/** Persist only UI choices; unavailable storage must not interrupt data analysis */
export function saveTrackingPreferences(accountId: string | undefined, preferences: TrackingPreferences): void {
  if (!accountId) return;
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(preferences));
  } catch {
    // The current page remains usable when browser storage is unavailable
  }
}
