import type { WorkSummary } from "@glaze/plugin-sdk";

/** Price as shown to players, e.g. "300 钻石" or "免费" */
export function priceText(work: WorkSummary): string {
  if (work.priceType === "free" || work.price <= 0) {
    return "免费";
  }
  return `${work.price} ${work.priceType === "point" ? "绿宝石" : "钻石"}`;
}

export { formatDate, formatDateTime } from "@glaze/plugin-sdk";
