import { type CommentPage, QueryCache, type RpcResult } from "@glaze/plugin-sdk";

export interface CommentScanProgress {
  data: CommentPage;
  scanned: number;
  total: number;
}

type ScanListener = (progress: CommentScanProgress) => void;

interface PendingScan {
  listeners: Set<ScanListener>;
  progress?: CommentScanProgress;
  promise: Promise<RpcResult<CommentPage>>;
}

/** Bounded page cache owned by one account view, sharing identical in-flight reads */
export class CommentPageCache {
  private cache: QueryCache<CommentPage>;
  private scans = new Map<string, PendingScan>();

  constructor(now = Date.now, ttl = 30_000, capacity = 20) {
    this.cache = new QueryCache<CommentPage>({ ttl, capacity, now, errorMessage: "评论请求失败，请重试" });
  }

  /** Return previous rows immediately while an expired page revalidates */
  peek(key: string): CommentPage | null {
    return this.cache.peek(key);
  }

  /** Only successful, recent responses can skip the network */
  fresh(key: string): boolean {
    return this.cache.fresh(key);
  }

  /** Coalesce repeated requests, retaining good rows on failure and bounding memory */
  read(key: string, load: () => Promise<RpcResult<CommentPage>>): Promise<RpcResult<CommentPage>> {
    return this.cache.read(key, load);
  }

  /** Share a source scan and replay its latest batch to new rating or page subscribers */
  async readScan(
    key: string,
    load: (publish: ScanListener, isCurrent: () => boolean) => Promise<RpcResult<CommentPage>>,
    onProgress: ScanListener,
    signal?: AbortSignal,
  ): Promise<RpcResult<CommentPage>> {
    let scan = this.scans.get(key);
    if (!scan) {
      const pending: PendingScan = {
        listeners: new Set(),
        promise: this.read(key, () =>
          load(
            (progress) => {
              if (this.scans.get(key) !== pending) return;
              pending.progress = progress;
              for (const listener of pending.listeners) listener(progress);
            },
            () => this.scans.get(key) === pending,
          ),
        ).finally(() => {
          if (this.scans.get(key) === pending) this.scans.delete(key);
        }),
      };
      this.scans.set(key, pending);
      scan = pending;
    }
    const current = scan;
    /** Stop requesting later batches once no view needs this scan, allowing effect replay to rejoin */
    const release = () => {
      current.listeners.delete(onProgress);
      queueMicrotask(() => {
        if (current.listeners.size || this.scans.get(key) !== current) return;
        this.scans.delete(key);
        this.cache.invalidate(key);
      });
    };
    scan.listeners.add(onProgress);
    signal?.addEventListener("abort", release, { once: true });
    if (signal?.aborted) release();
    try {
      if (scan.progress && !signal?.aborted) onProgress(scan.progress);
      return await scan.promise;
    } finally {
      signal?.removeEventListener("abort", release);
      release();
    }
  }

  /** Manual refresh revalidates pages without multiplying requests already in progress */
  expire(): void {
    this.cache.expire();
  }

  /** A successful reply discards pre-write requests so they cannot restore old reply state */
  clear(): void {
    this.scans.clear();
    this.cache.invalidate();
  }
}
