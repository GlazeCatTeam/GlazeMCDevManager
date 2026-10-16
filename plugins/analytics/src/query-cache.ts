import { QueryCache, type RpcResult } from "@glaze/plugin-sdk";

/** Small renderer-memory cache; callers key every entry by account, method and exact parameters */
export class AnalyticsQueryCache {
  private cache: QueryCache;

  constructor(capacity = 30, now = Date.now) {
    this.cache = new QueryCache({ ttl: 0, capacity, now });
  }

  /** Previously fetched data can render while its expired entry is refreshed */
  peek<T>(key: string): T | null {
    return this.cache.peek(key) as T | null;
  }

  /** Only unexpired successful results may skip a request */
  fresh(key: string): boolean {
    return this.cache.fresh(key);
  }

  /** Coalesce concurrent reads, cache successes, and ignore results invalidated during flight */
  read<T>(key: string, ttl: number, load: () => Promise<RpcResult<T>>): Promise<RpcResult<T>> {
    return this.cache.read(key, load, ttl) as Promise<RpcResult<T>>;
  }

  /** Revalidate in place so refreshes share pending work and retain the last successful result */
  expire(key: string): void {
    this.cache.expire(key);
  }

  /** Account/session changes and explicit cache clearing discard reusable results */
  invalidate(key?: string): void {
    this.cache.invalidate(key);
  }
}
