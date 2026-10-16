interface IconJob {
  listeners: Set<(url: string | null) => void>;
  running: boolean;
}

/** Cache account-owned icons and let visible search results take priority over queued image reads */
export class BannerWorkIcons {
  private cache = new Map<string, { url: string | null; expires: number }>();
  private jobs = new Map<string, IconJob>();
  private active = 0;
  private paused = false;

  constructor(private readonly load: (itemId: string) => Promise<string | null>) {}

  /** Return cached metadata synchronously to avoid flashing initials when rows remount */
  peek(itemId: string): string | null | undefined {
    const cached = this.cache.get(itemId);
    return cached && cached.expires > Date.now() ? cached.url : undefined;
  }

  /** Pause new icon requests during typing/search, without cancelling already running transport */
  setPaused(paused: boolean) {
    this.paused = paused;
    this.drain();
  }

  /** Subscribe only while a row is visible; remove unstarted jobs when their last row disappears */
  subscribe(itemId: string, listener: (url: string | null) => void) {
    const cached = this.peek(itemId);
    if (cached !== undefined) {
      listener(cached);
      return () => {};
    }
    let job = this.jobs.get(itemId);
    if (!job) {
      job = { listeners: new Set(), running: false };
      this.jobs.set(itemId, job);
    }
    job.listeners.add(listener);
    this.drain();
    return () => {
      job.listeners.delete(listener);
      if (!job.running && !job.listeners.size) this.jobs.delete(itemId);
    };
  }

  /** At most two detail reads run together; failures get a short retry cooldown */
  private drain() {
    if (this.paused) return;
    for (const [itemId, job] of this.jobs) {
      if (this.active >= 2) break;
      if (job.running) continue;
      job.running = true;
      this.active++;
      void Promise.resolve()
        .then(() => this.load(itemId))
        .then(
          (url) => this.complete(itemId, job, url, 300_000),
          () => this.complete(itemId, job, null, 30_000),
        );
    }
  }

  /** Publish once, retain a bounded cache, and release the next queued visible icon */
  private complete(itemId: string, job: IconJob, url: string | null, ttl: number) {
    this.cache.delete(itemId);
    this.cache.set(itemId, { url, expires: Date.now() + ttl });
    if (this.cache.size > 200) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.jobs.delete(itemId);
    this.active--;
    for (const listener of job.listeners) listener(url);
    this.drain();
  }
}
