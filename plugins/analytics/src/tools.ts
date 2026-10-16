import type { PluginToolHandler } from "@glaze/plugin-sdk";

/** Local calendar date N days before today, as YYYY-MM-DD */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type SortKey = "diamonds" | "purchases" | "downloads";

/** Rank PE works by sales over the last full days, ending yesterday */
export const topSellers: PluginToolHandler = async (params, ctx) => {
  const days = typeof params.days === "number" ? params.days : 7;
  const limit = typeof params.limit === "number" ? params.limit : 10;
  const sortBy: SortKey = params.sortBy === "purchases" || params.sortBy === "downloads" ? params.sortBy : "diamonds";
  const account = ctx.account ?? undefined;
  const works = await ctx.callHost("works.list", { ...(account ? { account } : {}), platform: "pe" });
  if (!works.ok) throw new Error(works.error.message);
  const ids = works.value.map((work) => work.itemId).slice(0, 500);
  const range = { startDate: daysAgo(days), endDate: daysAgo(1) };
  if (!ids.length) return { ...range, sortBy, items: [] };
  const daily = await ctx.callHost("analytics.daily", {
    ...(account ? { account } : {}),
    ...range,
    platform: "pe",
    resourceIds: ids,
  });
  if (!daily.ok) throw new Error(daily.error.message);
  const totals = new Map<
    string,
    { itemId: string; name: string; diamonds: number; purchases: number; downloads: number }
  >();
  for (const record of daily.value) {
    const row = totals.get(record.resourceId) ?? {
      itemId: record.resourceId,
      name: record.name,
      diamonds: 0,
      purchases: 0,
      downloads: 0,
    };
    row.diamonds += record.diamonds ?? 0;
    row.purchases += record.purchases ?? 0;
    row.downloads += record.downloads ?? 0;
    totals.set(record.resourceId, row);
  }
  const items = [...totals.values()]
    .filter((row) => row[sortBy] > 0)
    .sort((a, b) => b[sortBy] - a[sortBy])
    .slice(0, limit);
  return { ...range, sortBy, items };
};
