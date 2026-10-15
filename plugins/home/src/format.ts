const integer = new Intl.NumberFormat("zh-CN");
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

/** Shown in place of a value that has not loaded */
export const MISSING = "—";

/** Format a count with thousands separators, e.g. 12480 -> 12,480 */
export function formatCount(value: number): string {
  return integer.format(value);
}

/** Format a yuan amount with two decimals, e.g. 8642.5 -> 8,642.50 */
export function formatYuan(value: number): string {
  return money.format(value);
}

/** Format a large number with 万 / 亿, e.g. 57944118 -> 5794.4万 */
export function formatCompact(value: number): string {
  return compact.format(value);
}

/** "2026-09-22" -> "9月22日" */
export function formatDay(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}月${Number(day)}日`;
}
