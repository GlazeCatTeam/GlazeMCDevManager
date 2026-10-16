import type { CommentListParams, CommentPage, PlayerComment, RpcResult } from "@glaze/plugin-sdk";
import type { CommentPageCache, CommentScanProgress } from "./comment-cache";

/** Filter only received comments, keeping partial counts separate from final totals */
function ratingPage(data: CommentPage, params: CommentListParams, stars: number[]): CommentPage {
  const matching = data.items.filter((item) => stars.includes(item.stars));
  return { total: matching.length, items: matching.slice(params.start, params.start + params.span) };
}

/** Include rating selections in display-page keys while preserving ordinary server-page keys */
export function commentQueryKey(params: CommentListParams, stars: number[]): string {
  return JSON.stringify(stars.length ? { ...params, stars: [...stars].sort() } : params);
}

/** Publish matching comments after each batch while sharing the complete source scan */
export async function loadCommentPage(
  cache: CommentPageCache,
  params: CommentListParams,
  stars: number[],
  load: (params: CommentListParams) => Promise<RpcResult<CommentPage>>,
  onProgress: (progress: CommentScanProgress) => void = () => {},
  signal?: AbortSignal,
): Promise<RpcResult<CommentPage>> {
  if (!stars.length) return load(params);
  const first = { ...params, start: 0, span: 100 };
  const all = await cache.readScan(
    JSON.stringify({ ...first, scope: "all-ratings" }),
    async (publish, isCurrent) => {
      const items = new Map<string, PlayerComment>();
      const initialKey = JSON.stringify({ ...params, start: 0 });
      const initial = cache.fresh(initialKey) ? cache.peek(initialKey) : null;
      if (initial) publish({ data: initial, scanned: initial.items.length, total: initial.total });
      let total = 1;
      for (let start = 0; start < total; ) {
        if (!isCurrent()) return { ok: false, error: { kind: "business", message: "评论查询已失效，请重试" } };
        const source = { ...first, start };
        const key = JSON.stringify(source);
        const cached = cache.fresh(key) ? cache.peek(key) : null;
        const result = cached ? { ok: true as const, value: cached } : await load(source);
        if (!isCurrent()) return { ok: false, error: { kind: "business", message: "评论查询已失效，请重试" } };
        if (!result.ok) return result;
        total = result.value.total;
        if (!result.value.items.length && start < total) {
          return { ok: false, error: { kind: "business", message: "评论数据发生变化，请刷新后重试" } };
        }
        for (const item of result.value.items) items.set(item.id, item);
        start += result.value.items.length;
        publish({
          data: { total: items.size, items: [...items.values()] },
          scanned: Math.min(start, total),
          total,
        });
      }
      return { ok: true, value: { total: items.size, items: [...items.values()] } };
    },
    (progress) => onProgress({ ...progress, data: ratingPage(progress.data, params, stars) }),
    signal,
  );
  if (!all.ok) return all;
  return cache.read(commentQueryKey(params, stars), async () => ({
    ok: true,
    value: ratingPage(all.value, params, stars),
  }));
}
