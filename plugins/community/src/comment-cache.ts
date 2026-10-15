import type { CommentPage, RpcResult } from "@glaze/plugin-sdk";

interface CachedPage {
  data: CommentPage | null;
  expires: number;
  pending?: Promise<RpcResult<CommentPage>>;
}

/** Bounded page cache owned by one account view, sharing identical in-flight reads */
export class CommentPageCache {
  private pages = new Map<string, CachedPage>();

  constructor(
    private now = Date.now,
    private ttl = 30_000,
    private capacity = 20,
  ) {}

  /** Return previous rows immediately while an expired page revalidates */
  peek(key: string): CommentPage | null {
    return this.pages.get(key)?.data ?? null;
  }

  /** Only successful, recent responses can skip the network */
  fresh(key: string): boolean {
    const page = this.pages.get(key);
    return !!page?.data && page.expires > this.now();
  }

  /** Coalesce repeated requests, retaining good rows on failure and bounding memory */
  read(key: string, load: () => Promise<RpcResult<CommentPage>>): Promise<RpcResult<CommentPage>> {
    const page = this.pages.get(key) ?? { data: null, expires: 0 };
    this.pages.delete(key);
    this.pages.set(key, page);
    while (this.pages.size > this.capacity) this.pages.delete(this.pages.keys().next().value as string);
    if (page.pending) return page.pending;
    if (page.data && page.expires > this.now()) return Promise.resolve({ ok: true, value: page.data });
    const pending = Promise.resolve()
      .then(load)
      .catch(
        (): RpcResult<CommentPage> => ({ ok: false, error: { kind: "internal", message: "评论请求失败，请重试" } }),
      )
      .then((result) => {
        if (this.pages.get(key) === page) {
          delete page.pending;
          if (result.ok) {
            page.data = result.value;
            page.expires = this.now() + this.ttl;
          } else page.expires = 0;
        }
        return result;
      });
    page.pending = pending;
    return pending;
  }

  /** Manual refresh revalidates pages without multiplying requests already in progress */
  expire(): void {
    for (const page of this.pages.values()) page.expires = 0;
  }

  /** A successful reply discards pre-write requests so they cannot restore old reply state */
  clear(): void {
    this.pages.clear();
  }
}
