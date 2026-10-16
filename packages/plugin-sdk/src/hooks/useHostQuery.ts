import type { RpcError, RpcMethod, RpcMethods } from "@glaze/contracts";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useSession } from "../context/session";
import { hostQueryKey, hostQuerySnapshot, readHostQuery, sessionKeyOf, subscribeHostQuery } from "../query/host-query";

export interface HostQuery<T> {
  /** Last successful result; kept while reloading so a refresh does not blank the UI */
  data: T | null;
  /** Error of the latest attempt; null after a success */
  error: RpcError | null;
  /** True while a request runs or before the first result arrives */
  loading: boolean;
  reload: () => void;
  /** Loading while older data is still shown */
  refreshing?: boolean;
  /** Data belongs to the previous parameters of this query, shown until the new result arrives */
  isPrevious?: boolean;
  /** Time of the last successful result; 0 before the first one */
  updatedAt?: number;
}

export interface HostQueryOptions {
  /** How long a result can be reused without asking the host again; defaults to 30 seconds */
  ttl?: number;
  /** Set false to wait, e.g. until required parameters are known */
  enabled?: boolean;
  /** Keep showing the previous parameters' data while new data loads; defaults to true */
  keepPrevious?: boolean;
}

/**
 * Load a read capability through the shared cache. Revisiting a page shows the cached result at once
 * and refreshes stale data in the background; data never crosses accounts or sessions
 */
export function useHostQuery<M extends RpcMethod>(
  method: M,
  params?: RpcMethods[M]["params"],
  options: HostQueryOptions = {},
): HostQuery<RpcMethods[M]["result"]> & { prefetch: (next: RpcMethods[M]["params"]) => void } {
  const { current } = useSession();
  const { ttl, enabled = true, keepPrevious = true } = options;
  const sessionKey = sessionKeyOf(current);
  const paramsKey = JSON.stringify(params ?? null);
  const key = hostQueryKey(sessionKey, method, paramsKey);
  const subscribe = useCallback(
    (notify: () => void) => subscribeHostQuery(key, method, JSON.parse(paramsKey), notify),
    [key, method, paramsKey],
  );
  const snapshot = useSyncExternalStore(subscribe, () => hostQuerySnapshot(key));
  useEffect(() => {
    if (enabled) void readHostQuery(key, method, JSON.parse(paramsKey), ttl === undefined ? {} : { ttl });
  }, [key, method, paramsKey, enabled, ttl]);

  // Remember the last data of this hook within the same session to bridge parameter changes
  const previous = useRef<{ sessionKey: string; data: unknown } | null>(null);
  if (snapshot.data !== null) previous.current = { sessionKey, data: snapshot.data };
  const bridged =
    keepPrevious && snapshot.data === null && previous.current?.sessionKey === sessionKey
      ? previous.current.data
      : null;
  const data = (snapshot.data ?? bridged) as RpcMethods[M]["result"] | null;
  const loading = snapshot.loading || (enabled && snapshot.updatedAt === 0 && snapshot.error === null);

  const reload = useCallback(() => {
    void readHostQuery(key, method, JSON.parse(paramsKey), { force: true, ...(ttl === undefined ? {} : { ttl }) });
  }, [key, method, paramsKey, ttl]);
  const prefetch = useCallback(
    (next: RpcMethods[M]["params"]) => {
      void readHostQuery(hostQueryKey(sessionKey, method, JSON.stringify(next ?? null)), method, next, {
        ...(ttl === undefined ? {} : { ttl }),
      });
    },
    [sessionKey, method, ttl],
  );
  return {
    data,
    error: snapshot.error,
    loading,
    reload,
    prefetch,
    refreshing: snapshot.loading && data !== null,
    isPrevious: snapshot.data === null && bridged !== null,
    updatedAt: snapshot.updatedAt,
  };
}

/** Warm a read for the current session before the user opens it, e.g. on hover */
export function usePrefetchHostQuery(): <M extends RpcMethod>(method: M, params?: RpcMethods[M]["params"]) => void {
  const { current } = useSession();
  const sessionKey = sessionKeyOf(current);
  return useCallback(
    (method, params) => {
      void readHostQuery(hostQueryKey(sessionKey, method, JSON.stringify(params ?? null)), method, params);
    },
    [sessionKey],
  );
}
