import type { FeedbackListParams, FeedbackPageData, PlayerFeedback, RpcResult } from "@glaze/plugin-sdk";

export type FeedbackReplyFilter = "全部" | "未回复" | "已回复";

/** Read the complete category/search result before filtering, abandoning obsolete queries between requests */
export async function loadAllFeedback(
  params: FeedbackListParams,
  load: (params: FeedbackListParams) => Promise<RpcResult<FeedbackPageData>>,
  active: () => boolean,
): Promise<RpcResult<FeedbackPageData> | null> {
  const entries = new Map<string, PlayerFeedback>();
  let total = 1;
  for (let start = 0; start < total; ) {
    if (!active()) return null;
    const result = await load({ ...params, start, span: 100 });
    if (!active()) return null;
    if (!result.ok) return result;
    total = result.value.total;
    if (!result.value.entries.length && start < total) {
      return { ok: false, error: { kind: "business", message: "反馈数据发生变化，请刷新后重试" } };
    }
    for (const entry of result.value.entries) entries.set(entry.id, entry);
    start += result.value.entries.length;
  }
  return { ok: true, value: { entries: [...entries.values()], total: entries.size } };
}

/** Count matching feedback across the complete query and only then select the display page */
export function filterFeedbackPage(
  entries: PlayerFeedback[],
  filter: FeedbackReplyFilter,
  page: number,
  span: number,
): FeedbackPageData {
  const matching = entries.filter((entry) => filter === "全部" || Boolean(entry.reply) === (filter === "已回复"));
  return { total: matching.length, entries: matching.slice(page * span, (page + 1) * span) };
}
