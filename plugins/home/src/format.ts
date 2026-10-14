const integer = new Intl.NumberFormat("zh-CN");
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format a count with thousands separators, e.g. 12480 -> 12,480 */
export function formatCount(value: number): string {
  return integer.format(value);
}

/** Format a yuan amount with two decimals, e.g. 8642.5 -> 8,642.50 */
export function formatYuan(value: number): string {
  return money.format(value);
}
