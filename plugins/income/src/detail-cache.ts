import { type IncomeDetail, QueryCache, type RpcResult } from "@glaze/plugin-sdk";

/** Page-local details shared across row mounts; the owning page isolates account and platform */
export class IncomeDetailCache {
  private cache: QueryCache<IncomeDetail>;

  constructor(
    private load: (id: string) => Promise<RpcResult<IncomeDetail>>,
    now = Date.now,
  ) {
    this.cache = new QueryCache<IncomeDetail>({ ttl: 60_000, capacity: 24, now });
  }

  /** Last successful detail renders immediately, even while it is being refreshed */
  peek(id: string): IncomeDetail | null {
    return this.cache.peek(id);
  }

  /** Successful details remain reusable for one minute */
  fresh(id: string): boolean {
    return this.cache.fresh(id);
  }

  /** Coalesce in-flight reads and keep a bounded set of recently opened details */
  read(id: string): Promise<RpcResult<IncomeDetail>> {
    return this.cache.read(id, () => this.load(id));
  }

  /** Explicit refresh expires cached values without blanking them; old requests cannot repopulate the cache */
  invalidate(id?: string): void {
    this.cache.expire(id, { detach: true });
  }
}
