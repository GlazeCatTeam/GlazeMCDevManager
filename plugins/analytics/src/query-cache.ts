import type { RpcResult } from "@glaze/plugin-sdk";

interface Entry {
  value: unknown;
  hasValue: boolean;
  expires: number;
  pending?: Promise<RpcResult<unknown>>;
}

/** Small renderer-memory cache; callers key every entry by account, method and exact parameters */
export class AnalyticsQueryCache {
  private entries = new Map<string, Entry>();

  constructor(
    private capacity = 30,
    private now = Date.now,
  ) {}

  /** Previously fetched data can render while its expired entry is refreshed */
  peek<T>(key: string): T | null {
    const entry = this.entries.get(key);
    return entry?.hasValue ? (entry.value as T) : null;
  }

  /** Only unexpired successful results may skip a request */
  fresh(key: string): boolean {
    const entry = this.entries.get(key);
    return !!entry?.hasValue && entry.expires > this.now();
  }

  /** Coalesce concurrent reads, cache successes, and ignore results invalidated during flight */
  read<T>(key: string, ttl: number, load: () => Promise<RpcResult<T>>): Promise<RpcResult<T>> {
    const entry = this.entries.get(key) ?? { value: null, hasValue: false, expires: 0 };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value as string);
    if (entry.pending) return entry.pending as Promise<RpcResult<T>>;
    if (this.fresh(key)) return Promise.resolve({ ok: true, value: entry.value as T });
    const pending = Promise.resolve()
      .then(load)
      .catch(
        (error: unknown): RpcResult<T> => ({
          ok: false,
          error: { kind: "internal", message: error instanceof Error ? error.message : "查询失败，请重试" },
        }),
      )
      .then((result) => {
        if (this.entries.get(key) === entry) {
          delete entry.pending;
          if (result.ok) {
            entry.value = result.value;
            entry.hasValue = true;
            entry.expires = this.now() + ttl;
          } else {
            this.entries.delete(key);
          }
        }
        return result;
      });
    entry.pending = pending;
    return pending;
  }

  /** Explicit refresh and account/session changes discard reusable results */
  invalidate(key?: string): void {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
  }
}
