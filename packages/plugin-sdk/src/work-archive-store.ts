export interface WorkArchiveSnapshot {
  ids: string[];
  ready: boolean;
  loading: boolean;
  error: string | null;
}

interface Entry {
  snapshot: WorkArchiveSnapshot;
  revision: number;
  pending?: Promise<string[]>;
  listeners: Set<() => void>;
}

/** Share archive reads across routes and retain newer push events over late responses */
export class WorkArchiveStore {
  private readonly entries = new Map<string, Entry>();
  private listening = false;

  constructor(
    private readonly read: (account: string) => Promise<string[]>,
    private readonly watch: (receive: (account: string, ids: string[]) => void) => void,
  ) {}

  private entry(account: string): Entry {
    let entry = this.entries.get(account);
    if (!entry) {
      entry = { snapshot: { ids: [], ready: false, loading: false, error: null }, revision: 0, listeners: new Set() };
      this.entries.set(account, entry);
    }
    return entry;
  }

  private connect(): void {
    if (this.listening) return;
    try {
      this.watch((account, ids) => this.receive(account, ids));
      this.listening = true;
    } catch {
      // A bridge may not exist yet in a preview; a later subscription retries installation
    }
  }

  private publish(entry: Entry, snapshot: WorkArchiveSnapshot): void {
    entry.snapshot = snapshot;
    for (const notify of entry.listeners) notify();
  }

  snapshot(account: string): WorkArchiveSnapshot {
    return this.entry(account).snapshot;
  }

  subscribe(account: string, notify: () => void): () => void {
    this.connect();
    const entry = this.entry(account);
    entry.listeners.add(notify);
    return () => {
      entry.listeners.delete(notify);
    };
  }

  private receive(account: string, ids: string[]): void {
    const entry = this.entry(account);
    entry.revision++;
    this.publish(entry, { ids, ready: true, loading: false, error: null });
  }

  /** Warm routes use the snapshot immediately; explicit refresh revalidates without blanking it */
  load(account: string, refresh = false): Promise<string[]> {
    this.connect();
    const entry = this.entry(account);
    if (entry.snapshot.ready && !refresh) return Promise.resolve(entry.snapshot.ids);
    if (entry.pending) return entry.pending;
    const revision = entry.revision;
    this.publish(entry, { ...entry.snapshot, loading: true, error: null });
    const pending = Promise.resolve()
      .then(() => this.read(account))
      .then((ids) => {
        if (entry.revision === revision) this.publish(entry, { ids, ready: true, loading: false, error: null });
        return entry.snapshot.ids;
      })
      .catch((error: unknown) => {
        if (entry.revision !== revision) return entry.snapshot.ids;
        this.publish(entry, {
          ...entry.snapshot,
          loading: false,
          error: error instanceof Error ? error.message : "归档记录读取失败",
        });
        throw error;
      })
      .finally(() => {
        if (entry.pending === pending) delete entry.pending;
      });
    entry.pending = pending;
    return pending;
  }
}
