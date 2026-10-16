import type { RpcResult } from "@glaze/contracts";

interface Entry<T> {
  value: T | null;
  hasValue: boolean;
  expires: number;
  pending?: Promise<RpcResult<T>>;
}

export interface QueryCacheOptions {
  /** How long a successful result can skip the network */
  ttl: number;
  /** Least recently used entries beyond this count are dropped */
  capacity?: number;
  now?: () => number;
  /** Message used when the loader throws instead of returning a result */
  errorMessage?: string;
}

export type QueryKeyMatch = string | ((key: string) => boolean);

// Every cache registers weakly so clearing local caches reaches plugin-owned instances too
const instances = new Set<WeakRef<QueryCache<unknown>>>();

/** Forget every entry of every live QueryCache */
export function clearQueryCaches(): void {
  for (const ref of instances) {
    const cache = ref.deref();
    if (cache) cache.invalidate();
    else instances.delete(ref);
  }
}

/** Turn a key or predicate into a predicate; undefined matches every key */
function matcher(match?: QueryKeyMatch): (key: string) => boolean {
  if (match === undefined) return () => true;
  return typeof match === "string" ? (key) => key === match : match;
}

/**
 * Bounded renderer-memory read cache shared by every plugin.
 * Identical reads share one request, failures never become empty successes, and the last good value
 * stays available while an expired entry revalidates
 */
export class QueryCache<T = unknown> {
  private entries = new Map<string, Entry<T>>();
  private readonly ttl: number;
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly errorMessage: string;

  constructor(options: QueryCacheOptions) {
    this.ttl = options.ttl;
    this.capacity = options.capacity ?? 50;
    this.now = options.now ?? Date.now;
    this.errorMessage = options.errorMessage ?? "查询失败，请重试";
    instances.add(new WeakRef(this as QueryCache<unknown>));
  }

  /** Last successful value, fresh or not */
  peek(key: string): T | null {
    const entry = this.entries.get(key);
    return entry?.hasValue ? entry.value : null;
  }

  /** Only unexpired successful results may skip a request */
  fresh(key: string): boolean {
    const entry = this.entries.get(key);
    return !!entry?.hasValue && entry.expires > this.now();
  }

  /** Coalesce concurrent reads, cache successes, and ignore results invalidated during flight */
  read(key: string, load: () => Promise<RpcResult<T>>, ttl = this.ttl): Promise<RpcResult<T>> {
    const entry = this.entries.get(key) ?? { value: null, hasValue: false, expires: 0 };
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value as string);
    if (entry.pending) return entry.pending;
    if (entry.hasValue && entry.expires > this.now()) return Promise.resolve({ ok: true, value: entry.value as T });
    const pending = Promise.resolve()
      .then(load)
      .catch(
        (error: unknown): RpcResult<T> => ({
          ok: false,
          error: { kind: "internal", message: error instanceof Error ? error.message : this.errorMessage },
        }),
      )
      .then((result) => {
        if (this.entries.get(key) === entry) {
          delete entry.pending;
          if (result.ok) {
            entry.value = result.value;
            entry.hasValue = true;
            entry.expires = this.now() + ttl;
          } else if (result.error.kind === "session_expired" || !entry.hasValue) {
            this.entries.delete(key);
          } else {
            entry.expires = 0;
          }
        }
        return result;
      });
    entry.pending = pending;
    return pending;
  }

  /**
   * Mark matching entries stale without blanking them; the next read revalidates in place.
   * With detach, requests already in flight can no longer update the entry
   */
  expire(match?: QueryKeyMatch, options: { detach?: boolean } = {}): void {
    const test = matcher(match);
    for (const [key, entry] of this.entries)
      if (!test(key)) continue;
      else if (options.detach) this.entries.set(key, { value: entry.value, hasValue: entry.hasValue, expires: 0 });
      else entry.expires = 0;
  }

  /** Forget matching entries; older outstanding requests cannot repopulate them */
  invalidate(match?: QueryKeyMatch): void {
    const test = matcher(match);
    for (const key of [...this.entries.keys()]) if (test(key)) this.entries.delete(key);
  }
}
