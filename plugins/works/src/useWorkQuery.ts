import {
  callHost,
  type HostQuery,
  onHostEvent,
  type RpcResult,
  type WorkDetail,
  type WorkEditorDocument,
  type WorkEditorOptions,
  type WorkPage,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useState } from "react";
import { WorkQueryCache } from "./query-cache";
import { clearWorkListPositions } from "./view-state";

const pages = new WorkQueryCache<WorkPage>(30_000, 50);
const covers = new WorkQueryCache<WorkDetail>(5 * 60_000, 200);
const editors = new WorkQueryCache<WorkEditorDocument>(15_000, 30);
const options = new WorkQueryCache<WorkEditorOptions>(5 * 60_000, 5);
let generation = 0;
const changeListeners = new Set<() => void>();
let listening = false;

/** Expire cached rows when works change elsewhere, e.g. through an AI tool, and wake mounted lists and covers */
function listenForChanges(): void {
  if (listening) return;
  try {
    onHostEvent("data.changed", ({ modules }) => {
      if (!modules.includes("works") && !modules.includes("promotion")) return;
      pages.expire();
      covers.expire();
      // Open editors keep their document; the next visit revalidates instead of replacing it mid-edit
      editors.expire();
      for (const notify of changeListeners) notify();
    });
    listening = true;
  } catch {
    // Outside the app window there is no host to report changes
  }
}

/** Share the same read between idle warmup and the mounted first page */
export function preloadWorksPage(account: string): Promise<RpcResult<WorkPage>> {
  return pages.read(JSON.stringify([account, 0, 9]), () => callHost("works.page", { account, page: 0, pageSize: 9 }));
}

/** Prepare only the adjacent page, with at most two background cover requests at once */
export async function preloadNextWorksPage(
  account: string,
  page: number,
  pageSize: number,
  total: number,
  cancelled: () => boolean = () => false,
): Promise<void> {
  const next = page + 1;
  if (cancelled() || next * pageSize >= total) return;
  const epoch = generation;
  const stale = () => cancelled() || epoch !== generation;
  const result = await pages.read(JSON.stringify([account, next, pageSize]), () =>
    callHost("works.page", { account, page: next, pageSize }),
  );
  if (!result.ok || stale()) return;
  let index = 0;
  const worker = async () => {
    while (!stale()) {
      const work = result.value.items[index++];
      if (!work) return;
      await covers.read(JSON.stringify([account, work.itemId]), () =>
        callHost("works.get", { account, itemId: work.itemId }),
      );
    }
  };
  await Promise.all([worker(), worker()]);
}

/** Prepare only the selected work and shared form options, without submitting any mutation */
export async function preloadWorkEditor(account: string, itemId: string): Promise<void> {
  await Promise.all([
    editors.read(JSON.stringify([account, itemId]), () => callHost("works.editor", { account, itemId })),
    preloadWorkOptions(account),
  ]);
}

/** Options are shared across works while save-time validation remains authoritative in the host */
export function preloadWorkOptions(account: string): Promise<RpcResult<WorkEditorOptions>> {
  return options.read(JSON.stringify([account, "options"]), () => callHost("works.options", { account }));
}

/** Account changes discard read snapshots, including pending prefetch results */
export function clearWorkReads(): void {
  generation++;
  clearWorkListPositions();
  pages.invalidate();
  covers.invalidate();
  editors.invalidate();
  options.invalidate();
}

/** Invalidate list and cover metadata after a mutation or an explicit refresh */
export function invalidateWorks(account: string): void {
  generation++;
  const prefix = `${JSON.stringify([account]).slice(0, -1)},`;
  pages.invalidate(prefix);
  covers.invalidate(prefix);
  editors.invalidate(prefix);
}

/** Keep account changes and late responses from showing another page's rows */
function useCachedWork<T>(
  cache: WorkQueryCache<T>,
  key: string,
  load: () => Promise<RpcResult<T>>,
  refreshToken = 0,
  followChanges = true,
): HostQuery<T> {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    listenForChanges();
    if (!followChanges) return;
    const notify = () => setVersion((value) => value + 1);
    changeListeners.add(notify);
    return () => {
      changeListeners.delete(notify);
    };
  }, [followChanges]);
  const [state, setState] = useState(() => ({
    key,
    data: cache.peek(key),
    error: null as HostQuery<T>["error"],
    loading: !cache.fresh(key),
  }));
  useEffect(() => {
    let active = true;
    void version;
    void refreshToken;
    setState((old) => ({
      key,
      data: cache.peek(key) ?? (old.key === key ? old.data : null),
      error: null,
      loading: !cache.fresh(key),
    }));
    void cache.read(key, load).then((result) => {
      if (!active) return;
      setState((old) => ({
        key,
        data: result.ok ? result.value : old.key === key ? old.data : null,
        error: result.ok ? null : result.error,
        loading: false,
      }));
    });
    return () => {
      active = false;
    };
  }, [cache, key, load, version, refreshToken]);
  const reload = useCallback(() => {
    cache.invalidate(key);
    setVersion((v) => v + 1);
  }, [cache, key]);
  return {
    ...(state.key === key ? state : { data: cache.peek(key), error: null, loading: !cache.fresh(key) }),
    reload,
  };
}

/** Page requests are account-specific and reuse recent rows on route re-entry */
export function useWorksPage(account: string, page: number, pageSize: number): HostQuery<WorkPage> {
  const load = useCallback(() => callHost("works.page", { account, page, pageSize }), [account, page, pageSize]);
  return useCachedWork(pages, JSON.stringify([account, page, pageSize]), load);
}

/** Reuse a recent or intent-prefetched detail; expired documents revalidate before editing */
export function useWorkEditor(account: string, itemId: string): HostQuery<WorkEditorDocument> {
  const load = useCallback(() => callHost("works.editor", { account, itemId }), [account, itemId]);
  return useCachedWork(editors, JSON.stringify([account, itemId]), load, 0, false);
}

/** Keep platform dictionaries out of the repeated detail-navigation request path */
export function useWorkOptions(account: string): HostQuery<WorkEditorOptions> {
  const load = useCallback(() => callHost("works.options", { account }), [account]);
  return useCachedWork(options, JSON.stringify([account, "options"]), load, 0, false);
}

/** Covers load independently of the page and survive pagination and route changes */
export function useWorkCover(account: string, itemId: string, refreshToken = 0): HostQuery<WorkDetail> {
  const load = useCallback(() => callHost("works.get", { account, itemId }), [account, itemId]);
  return useCachedWork(covers, JSON.stringify([account, itemId]), load, refreshToken);
}
