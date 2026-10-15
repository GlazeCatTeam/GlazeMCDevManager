import { callHost, type HostQuery, onHostEvent, type RpcMethods, useSession } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useState } from "react";
import { AnalyticsQueryCache } from "./query-cache";

type Queries = Pick<
  RpcMethods,
  "works.list" | "analytics.daily" | "analytics.monthly" | "analytics.realtime" | "analytics.periodIncome"
>;

const cache = new AnalyticsQueryCache();
let listening = false;

/** Keep cached data out of subsequent login sessions, even while this page is unmounted */
function observeAccounts(): void {
  if (listening) return;
  onHostEvent("account.changed", () => cache.invalidate());
  onHostEvent("cache.cleared", () => cache.invalidate());
  listening = true;
}

/** Reuse exact analysis queries across route changes; refresh always invalidates that query */
export function useAnalyticsQuery<M extends keyof Queries>(
  method: M,
  params?: Queries[M]["params"],
): HostQuery<Queries[M]["result"]> {
  const { current } = useSession();
  const account = current?.id ?? null;
  const paramsKey = JSON.stringify(params ?? {});
  const key = JSON.stringify([account, current?.lastLoginAt, method, paramsKey]);
  const ttl = method === "analytics.realtime" ? 0 : method === "works.list" ? 30_000 : 60_000;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState(() => ({
    key,
    data: cache.peek<Queries[M]["result"]>(key),
    loading: !cache.fresh(key),
    error: null as HostQuery<unknown>["error"],
  }));

  useEffect(() => {
    observeAccounts();
    let active = true;
    void version;
    setState((old) => ({
      key,
      data: cache.peek(key) ?? (old.key === key ? old.data : null),
      loading: !cache.fresh(key),
      error: null,
    }));
    const load = () =>
      account
        ? callHost(method, { ...JSON.parse(paramsKey), account })
        : Promise.resolve({ ok: false as const, error: { kind: "not_found", message: "请先登录开发者账号" } });
    void cache.read<Queries[M]["result"]>(key, ttl, load).then((result) => {
      if (!active) return;
      setState({ key, data: result.ok ? result.value : null, error: result.ok ? null : result.error, loading: false });
    });
    return () => {
      active = false;
    };
  }, [key, method, paramsKey, account, ttl, version]);

  const reload = useCallback(() => {
    cache.invalidate(key);
    setVersion((value) => value + 1);
  }, [key]);

  return {
    ...(state.key === key
      ? state
      : { data: cache.peek<Queries[M]["result"]>(key), loading: !cache.fresh(key), error: null }),
    reload,
  };
}
