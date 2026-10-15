import {
  callHost,
  type HostQuery,
  onHostEvent,
  type RpcResult,
  type WorkDetail,
  type WorkPage,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useState } from "react";
import { WorkQueryCache } from "./query-cache";

const pages = new WorkQueryCache<WorkPage>(30_000, 50);
const covers = new WorkQueryCache<WorkDetail>(5 * 60_000, 200);

/** Invalidate list and cover metadata after a mutation or an explicit refresh */
export function invalidateWorks(account: string): void {
  const prefix = `${JSON.stringify([account]).slice(0, -1)},`;
  pages.invalidate(prefix);
  covers.invalidate(prefix);
}

/** Keep account changes and late responses from showing another page's rows */
function useCachedWork<T>(cache: WorkQueryCache<T>, key: string, load: () => Promise<RpcResult<T>>): HostQuery<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState(() => ({
    key,
    data: cache.peek(key),
    error: null as HostQuery<T>["error"],
    loading: !cache.fresh(key),
  }));
  useEffect(() => {
    let active = true;
    void version;
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
  }, [cache, key, load, version]);
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
  useEffect(
    () =>
      onHostEvent("account.changed", () => {
        pages.invalidate();
        covers.invalidate();
      }),
    [],
  );
  return useCachedWork(pages, JSON.stringify([account, page, pageSize]), load);
}

/** Covers load independently of the page and survive pagination and route changes */
export function useWorkCover(account: string, itemId: string): HostQuery<WorkDetail> {
  const load = useCallback(() => callHost("works.get", { account, itemId }), [account, itemId]);
  return useCachedWork(covers, JSON.stringify([account, itemId]), load);
}
