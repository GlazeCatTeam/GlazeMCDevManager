import type { DayRange, MonthRange } from "../data";

// Segmented-control options shared by the analytics views

export const dayRangeOptions = ([7, 14, 30] as const).map((value) => ({
  value: value as DayRange,
  label: `近 ${value} 天`,
}));

export const monthRangeOptions = ([3, 6, 12] as const).map((value) => ({
  value: value as MonthRange,
  label: `近 ${value} 个月`,
}));

export const chartKindOptions = [
  { value: "line", label: "折线" },
  { value: "bar", label: "柱状" },
] as const;

/** "2026-10-01 — 2026-10-14" for a list of dates or months */
export function rangeText(keys: string[]): string {
  return `${keys[0]} — ${keys.at(-1)}`;
}
