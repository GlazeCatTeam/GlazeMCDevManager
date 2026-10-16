import type { RpcError, RpcResult, WorkSearchItem, WorkSearchPage } from "@glaze/plugin-sdk";

export type SearchKind = "name" | "id";
export type WorkSearchLoader = (query: string, kind: SearchKind, page: number) => Promise<RpcResult<WorkSearchPage>>;
export interface WorkSearchState {
  query: string;
  kind: SearchKind;
  data: WorkSearchItem[] | null;
  total: number;
  loading: boolean;
  error: RpcError | null;
  preview: boolean;
}
interface SearchSlot {
  state: WorkSearchState;
  page: number;
  received: number;
  scrollTop: number;
  updatedAt: number;
  pending: Promise<void> | null;
}

/** Keep browse/search pages independent and coalesce requests within each account-owned model */
export class BannerWorkSearch {
  private slots = new Map<string, SearchSlot>();
  private catalog = new Map<string, WorkSearchItem>();
  private listeners = new Set<() => void>();
  private active: SearchSlot;

  constructor(private readonly load: WorkSearchLoader) {
    this.active = this.slot("", "name");
  }

  /** Reuse recent query pages while keeping the browsing position until an explicit refresh */
  private slot(query: string, kind: SearchKind): SearchSlot {
    const key = JSON.stringify([kind, query]);
    const existing = this.slots.get(key);
    if (existing && (!query || existing.pending || Date.now() - existing.updatedAt < 300_000)) return existing;
    const matches = query
      ? [...this.catalog.values()]
          .filter((work) =>
            kind === "id" ? work.itemId === query : work.name.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 5)
      : [];
    const slot: SearchSlot = {
      state: {
        query,
        kind,
        data: matches.length ? matches : null,
        total: 0,
        loading: false,
        error: null,
        preview: matches.length > 0,
      },
      page: 0,
      received: 0,
      scrollTop: 0,
      updatedAt: Date.now(),
      pending: null,
    };
    this.slots.set(key, slot);
    if (this.slots.size > 20) {
      const oldest = [...this.slots].find(
        ([, entry]) => entry !== this.active && entry !== slot && entry.state.query && !entry.pending,
      );
      if (oldest) this.slots.delete(oldest[0]);
    }
    return slot;
  }

  /** Publish a new snapshot so changes to selected-work metadata also reach React */
  private emit() {
    this.active.state = { ...this.active.state };
    for (const listener of this.listeners) listener();
  }

  /** Subscribe without coupling request lifetime to React's development effect replay */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Return an immutable snapshot for useSyncExternalStore */
  getSnapshot = () => this.active.state;

  /** Switch results immediately; requests for old queries can only update their own cache */
  activate(query: string, kind: SearchKind) {
    const text = query.trim();
    this.active = this.slot(text, text ? kind : "name");
    this.emit();
  }

  /** Load one batch, preserving rows and the page cursor when a request fails */
  private read(slot: SearchSlot): Promise<void> {
    if (slot.pending) return slot.pending;
    if (slot.page > 0 && slot.received >= slot.state.total) return Promise.resolve();
    slot.state = { ...slot.state, loading: true, error: null };
    slot.pending = Promise.resolve().then(async () => {
      try {
        const result = await this.load(slot.state.query, slot.state.kind, slot.page);
        if (this.slots.get(JSON.stringify([slot.state.kind, slot.state.query])) !== slot) return;
        if (!result.ok) {
          slot.state = { ...slot.state, error: result.error };
          return;
        }
        if (!result.value.items.length && slot.received < result.value.total) {
          slot.state = { ...slot.state, error: { kind: "parse", message: "作品列表暂未返回下一批，请重试" } };
          return;
        }
        const rows = new Map((slot.page > 0 ? (slot.state.data ?? []) : []).map((work) => [work.itemId, work]));
        for (const work of result.value.items) {
          rows.set(work.itemId, work);
          this.catalog.set(work.itemId, work);
        }
        slot.received += result.value.items.length;
        slot.page++;
        slot.updatedAt = Date.now();
        slot.state = { ...slot.state, data: [...rows.values()], total: result.value.total, preview: false };
      } catch (cause) {
        slot.state = {
          ...slot.state,
          error: { kind: "internal", message: cause instanceof Error ? cause.message : "作品查询失败，请重试" },
        };
      } finally {
        slot.pending = null;
        slot.state = { ...slot.state, loading: false };
        this.emit();
      }
    });
    this.emit();
    return slot.pending;
  }

  /** Fetch the active query's next five results only when requested */
  loadMore = () => this.read(this.active);

  /** Count received platform rows when determining whether another page exists */
  hasMore = () => this.active.page > 0 && this.active.received < this.active.state.total;

  /** Load a new query once; revisiting a cached query does not advance its page */
  start = () => (this.active.page === 0 ? this.loadMore() : Promise.resolve());

  /** Refresh only the current query, isolating any response from its previous generation */
  reload = () => {
    const { query, kind } = this.active.state;
    const previous = this.active;
    this.slots.delete(JSON.stringify([kind, query]));
    this.active = this.slot(query, kind);
    this.active.state = { ...this.active.state, data: previous.state.data, total: previous.state.total, preview: true };
    this.active.scrollTop = previous.scrollTop;
    return this.loadMore();
  };

  /** Restore a saved selection with one exact lookup instead of walking all browse pages */
  ensureSelected = (itemId: string) => {
    if (!itemId || this.catalog.has(itemId)) return Promise.resolve();
    return this.read(this.slot(itemId, "id"));
  };

  /** Selected rows remain available after changing or clearing the search */
  selected = (itemId: string) => this.catalog.get(itemId);

  /** Keep each query's scroll position independently of its loaded results */
  saveScroll = (top: number) => {
    this.active.scrollTop = top;
  };
  /** Restore the last browse/search position after switching the active query */
  getScroll = () => this.active.scrollTop;
}
