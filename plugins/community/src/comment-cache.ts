import { type CommentPage, QueryCache, type RpcResult } from "@glaze/plugin-sdk";

/** Bounded page cache owned by one account view, sharing identical in-flight reads */
export class CommentPageCache {
  private cache: QueryCache<CommentPage>;

  constructor(now = Date.now, ttl = 30_000, capacity = 20) {
    this.cache = new QueryCache<CommentPage>({ ttl, capacity, now, errorMessage: "评论请求失败，请重试" });
  }

  /** Return previous rows immediately while an expired page revalidates */
  peek(key: string): CommentPage | null {
    return this.cache.peek(key);
  }

  /** Only successful, recent responses can skip the network */
  fresh(key: string): boolean {
    return this.cache.fresh(key);
  }

  /** Coalesce repeated requests, retaining good rows on failure and bounding memory */
  read(key: string, load: () => Promise<RpcResult<CommentPage>>): Promise<RpcResult<CommentPage>> {
    return this.cache.read(key, load);
  }

  /** Manual refresh revalidates pages without multiplying requests already in progress */
  expire(): void {
    this.cache.expire();
  }

  /** A successful reply discards pre-write requests so they cannot restore old reply state */
  clear(): void {
    this.cache.invalidate();
  }
}
