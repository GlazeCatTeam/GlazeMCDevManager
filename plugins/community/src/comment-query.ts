import type { CommentListParams, CommentPage, PlayerComment, RpcResult } from "@glaze/plugin-sdk";
import type { CommentPageCache } from "./comment-cache";

/** Include rating selections in display-page keys while preserving ordinary server-page keys */
export function commentQueryKey(params: CommentListParams, stars: number[]): string {
  return JSON.stringify(stars.length ? { ...params, stars: [...stars].sort() } : params);
}

/** Collect the current server query before rating filtering and paginate only the matching comments */
export async function loadCommentPage(
  cache: CommentPageCache,
  params: CommentListParams,
  stars: number[],
  load: (params: CommentListParams) => Promise<RpcResult<CommentPage>>,
): Promise<RpcResult<CommentPage>> {
  if (!stars.length) return load(params);
  const first = { ...params, start: 0 };
  const all = await cache.read(JSON.stringify({ ...first, scope: "all-ratings" }), async () => {
    const items = new Map<string, PlayerComment>();
    let total = 1;
    for (let start = 0; start < total; start += params.span) {
      const source = { ...first, start };
      const key = JSON.stringify(source);
      const cached = cache.fresh(key) ? cache.peek(key) : null;
      const result = cached ? { ok: true as const, value: cached } : await load(source);
      if (!result.ok) return result;
      total = result.value.total;
      if (!result.value.items.length && start < total) {
        return { ok: false, error: { kind: "business", message: "评论数据发生变化，请刷新后重试" } };
      }
      for (const item of result.value.items) items.set(item.id, item);
    }
    return { ok: true, value: { total: items.size, items: [...items.values()] } };
  });
  if (!all.ok) return all;
  const matching = all.value.items.filter((item) => stars.includes(item.stars));
  return {
    ok: true,
    value: { total: matching.length, items: matching.slice(params.start, params.start + params.span) },
  };
}
