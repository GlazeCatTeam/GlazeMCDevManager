import type { RpcResult } from "@glaze/plugin-sdk";

interface Entry<T> {
  value: T | null;
  expires: number;
  pending?: Promise<RpcResult<T>>;
}

/** Bounded read cache for work pages and cover details, with shared in-flight requests */
export class WorkQueryCache<T> {
  private entries = new Map<string, Entry<T>>();

  constructor(
    private ttl: number,
    private capacity: number,
    private now = Date.now,
  ) {}

  /** Cached rows may render immediately while an expired entry revalidates */
  peek(key: string): T | null {
    return this.entries.get(key)?.value ?? null;
  }

  /** A fresh entry needs no network request */
  fresh(key: string): boolean {
    const entry = this.entries.get(key);
    return !!entry && entry.value !== null && entry.expires > this.now();
  }

  /** Coalesce identical reads and never cache a failure as a successful empty page */
  read(key: string, load: () => Promise<RpcResult<T>>): Promise<RpcResult<T>> {
    const entry = this.entries.get(key) ?? { value: null, expires: 0 };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value as string);
    if (entry.pending) return entry.pending;
    if (entry.value !== null && entry.expires > this.now()) return Promise.resolve({ ok: true, value: entry.value });
    const pending = Promise.resolve()
      .then(load)
      .catch(
        (error: unknown): RpcResult<T> => ({
          ok: false,
          error: { kind: "internal", message: error instanceof Error ? error.message : "作品加载失败，请重试" },
        }),
      )
      .then((result) => {
        if (this.entries.get(key) === entry) {
          delete entry.pending;
          if (result.ok) {
            entry.value = result.value;
            entry.expires = this.now() + this.ttl;
          } else entry.expires = 0;
        }
        return result;
      });
    entry.pending = pending;
    return pending;
  }

  /** Forget matching entries; an older outstanding request cannot repopulate them */
  invalidate(prefix = ""): void {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}
