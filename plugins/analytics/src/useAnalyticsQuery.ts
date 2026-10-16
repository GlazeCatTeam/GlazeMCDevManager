import { callHost, type HostQuery, onHostEvent, type RpcMethods, useSession } from "@glaze/plugin-sdk";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnalyticsQueryCache } from "./query-cache";

type Queries = Pick<
  RpcMethods,
  "works.list" | "analytics.daily" | "analytics.monthly" | "analytics.realtime" | "analytics.periodIncome"
>;

const cache = new AnalyticsQueryCache();
export const AnalysisActivity = createContext(true);
let listening = false;
let generation = 0;
const listeners = new Set<() => void>();

/** Notify mounted consumers when a session or explicit cache clearing invalidates their snapshots */
function clearQueries(): void {
  cache.invalidate();
  generation++;
  for (const listener of listeners) listener();
}

/** Subscribe without accumulating host listeners when tabs are revisited */
function subscribe(listener: () => void): () => void {
  observeAccounts();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Keep cached data out of subsequent login sessions, even while this page is unmounted */
function observeAccounts(): void {
  if (listening) return;
  onHostEvent("account.changed", clearQueries);
  onHostEvent("cache.cleared", clearQueries);
  listening = true;
}

/** Share invalidation identity with retained views so account and cache clearing remove old data immediately */
export function useAnalysisEpoch(): number {
  return useSyncExternalStore(subscribe, () => generation);
}

/** Keep the last successful result with its original scope while a new filter is loading or has failed */
export function useAnalysisSnapshot<T, S>(query: HostQuery<T>, scope: S, enabled = true) {
  const { current } = useSession();
  const epoch = useAnalysisEpoch();
  const identity = JSON.stringify([current?.id, current?.lastLoginAt, epoch]);
  const scopeKey = JSON.stringify(scope);
  const [last, setLast] = useState<{ identity: string; scopeKey: string; scope: S; data: T } | null>(null);
  if (query.data !== null && enabled) {
    if (last?.identity !== identity || last.scopeKey !== scopeKey || last.data !== query.data) {
      setLast({ identity, scopeKey, scope, data: query.data });
    }
  } else if ((!enabled || last?.identity !== identity || query.error?.kind === "session_expired") && last) {
    setLast(null);
  }
  const previous =
    enabled && query.data === null && last?.identity === identity && query.error?.kind !== "session_expired";
  return {
    ...query,
    data: enabled ? (query.data ?? (previous ? last.data : null)) : null,
    scope: previous ? last.scope : scope,
    previous,
  };
}

/** Reuse exact queries, coalesce rapid filter changes and keep successful data during refresh */
export function useAnalyticsQuery<M extends keyof Queries>(
  method: M,
  params?: Queries[M]["params"],
  enabled = true,
): HostQuery<Queries[M]["result"]> {
  const { current } = useSession();
  const visible = useContext(AnalysisActivity);
  const account = current?.id ?? null;
  const paramsKey = JSON.stringify(params ?? {});
  const epoch = useAnalysisEpoch();
  const key = JSON.stringify([account, current?.lastLoginAt, epoch, method, paramsKey]);
  const ttl = method === "analytics.realtime" ? 0 : method === "works.list" ? 30_000 : 60_000;
  const [version, setVersion] = useState(0);
  const previousKey = useRef(key);
  const inFlight = useRef(false);
  const [state, setState] = useState(() => ({
    key,
    data: cache.peek<Queries[M]["result"]>(key),
    loading: enabled && !cache.fresh(key),
    error: null as HostQuery<unknown>["error"],
  }));

  useEffect(() => {
    observeAccounts();
    if (!visible) {
      inFlight.current = false;
      return;
    }
    let active = true;
    const changed = previousKey.current !== key;
    previousKey.current = key;
    void version;
    setState((old) => ({
      key,
      data: cache.peek(key) ?? (old.key === key ? old.data : null),
      loading: enabled && !cache.fresh(key),
      error: null,
    }));
    const load = () =>
      account
        ? callHost(method, { ...JSON.parse(paramsKey), account })
        : Promise.resolve({ ok: false as const, error: { kind: "not_found", message: "请先登录开发者账号" } });
    inFlight.current = enabled;
    // A short trailing delay absorbs consecutive choices; cached scopes still render immediately
    const timer = window.setTimeout(
      () => {
        if (!enabled) return;
        void cache.read<Queries[M]["result"]>(key, ttl, load).then((result) => {
          if (!active) return;
          inFlight.current = false;
          setState({
            key,
            data: result.ok ? result.value : cache.peek(key),
            error: result.ok ? null : result.error,
            loading: false,
          });
        });
      },
      changed && !cache.fresh(key) ? 180 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key, method, paramsKey, account, ttl, version, enabled, visible]);

  const reload = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    cache.expire(key);
    setVersion((value) => value + 1);
  }, [key]);

  return {
    ...(state.key === key
      ? state
      : { data: cache.peek<Queries[M]["result"]>(key), loading: enabled && !cache.fresh(key), error: null }),
    reload,
  };
}
