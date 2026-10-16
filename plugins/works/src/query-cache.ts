import { QueryCache, type RpcResult } from "@glaze/plugin-sdk";

/** Bounded read cache for work pages and cover details, with shared in-flight requests */
export class WorkQueryCache<T> {
  private cache: QueryCache<T>;

  constructor(ttl: number, capacity: number, now = Date.now) {
    this.cache = new QueryCache<T>({ ttl, capacity, now, errorMessage: "作品加载失败，请重试" });
  }

  /** Cached rows may render immediately while an expired entry revalidates */
  peek(key: string): T | null {
    return this.cache.peek(key);
  }

  /** A fresh entry needs no network request */
  fresh(key: string): boolean {
    return this.cache.fresh(key);
  }

  /** Coalesce identical reads and never cache a failure as a successful empty page */
  read(key: string, load: () => Promise<RpcResult<T>>): Promise<RpcResult<T>> {
    return this.cache.read(key, load);
  }

  /** Forget matching entries; an older outstanding request cannot repopulate them */
  invalidate(prefix = ""): void {
    this.cache.invalidate((key) => key.startsWith(prefix));
  }
}
