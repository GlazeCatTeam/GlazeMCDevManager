import type { IncomeDetail, RpcResult } from "@glaze/plugin-sdk";

interface Entry {
  data: IncomeDetail | null;
  expires: number;
  pending?: Promise<RpcResult<IncomeDetail>>;
}

/** Page-local details shared across row mounts; the owning page isolates account and platform */
export class IncomeDetailCache {
  private entries = new Map<string, Entry>();

  constructor(
    private load: (id: string) => Promise<RpcResult<IncomeDetail>>,
    private now = Date.now,
  ) {}

  /** Last successful detail renders immediately, even while it is being refreshed */
  peek(id: string): IncomeDetail | null {
    return this.entries.get(id)?.data ?? null;
  }

  /** Successful details remain reusable for one minute */
  fresh(id: string): boolean {
    const entry = this.entries.get(id);
    return !!entry?.data && entry.expires > this.now();
  }

  /** Coalesce in-flight reads and keep a bounded set of recently opened details */
  read(id: string): Promise<RpcResult<IncomeDetail>> {
    const entry = this.entries.get(id) ?? { data: null, expires: 0 };
    this.entries.delete(id);
    this.entries.set(id, entry);
    while (this.entries.size > 24) this.entries.delete(this.entries.keys().next().value as string);
    if (entry.pending) return entry.pending;
    if (entry.data && this.fresh(id)) return Promise.resolve({ ok: true, value: entry.data });
    const pending = Promise.resolve()
      .then(() => this.load(id))
      .catch(
        (error: unknown): RpcResult<IncomeDetail> => ({
          ok: false,
          error: { kind: "internal", message: error instanceof Error ? error.message : "查询失败，请重试" },
        }),
      )
      .then((result) => {
        if (this.entries.get(id) === entry) {
          delete entry.pending;
          if (result.ok) {
            entry.data = result.value;
            entry.expires = this.now() + 60_000;
          }
        }
        return result;
      });
    entry.pending = pending;
    return pending;
  }

  /** Explicit refresh expires cached values without blanking them; old requests cannot repopulate the cache */
  invalidate(id?: string): void {
    for (const [key, entry] of this.entries) {
      if (id === undefined || id === key) this.entries.set(key, { data: entry.data, expires: 0 });
    }
  }
}
