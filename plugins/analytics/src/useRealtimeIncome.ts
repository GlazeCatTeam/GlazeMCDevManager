import {
  type AnalyticsRealtime,
  callHost,
  type HostQuery,
  onHostEvent,
  type RpcResult,
  useSession,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeRealtimeIncome } from "./realtime-income";

type QueryState = Omit<HostQuery<AnalyticsRealtime>, "reload"> & { key: string };

/** Query one account and day, retaining successful resources during targeted retries */
export function useRealtimeIncome(date: string, resourceIds: string[]) {
  const { current } = useSession();
  const account = current?.id;
  const [epoch, setEpoch] = useState(0);
  const snapshots = useRef(new Map<string, AnalyticsRealtime>());
  const busy = useRef(false);
  const idsKey = JSON.stringify(resourceIds);
  const key = JSON.stringify([account, current?.lastLoginAt, epoch, date, idsKey]);
  const [request, setRequest] = useState({ version: 0, key, ids: null as string[] | null });
  const [state, setState] = useState<QueryState>({ key, data: null, error: null, loading: true });
  const pending = useRef<{ key: string; promise: Promise<RpcResult<AnalyticsRealtime>> } | null>(null);
  const scope = useRef(key);

  useEffect(
    () =>
      onHostEvent("cache.cleared", () => {
        snapshots.current.clear();
        setEpoch((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    // Returning to an earlier date starts a full query, even if its last action was a retry
    const scopeChanged = scope.current !== key;
    scope.current = key;
    const requestedIds: string[] =
      !scopeChanged && request.key === key && request.ids ? request.ids : JSON.parse(idsKey);
    const requestKey = JSON.stringify([key, request.version, requestedIds]);
    busy.current = true;
    setState((old) => ({
      key,
      data: old.key === key ? old.data : (snapshots.current.get(key) ?? null),
      loading: true,
      error: null,
    }));
    if (pending.current?.key !== requestKey) {
      pending.current = {
        key: requestKey,
        promise: Promise.resolve()
          .then(() => {
            if (!account) return { ok: false as const, error: { kind: "not_found", message: "请先登录开发者账号" } };
            return callHost("analytics.realtime", { account, date, resourceIds: requestedIds });
          })
          .catch(() => ({ ok: false as const, error: { kind: "internal", message: "实时收益请求中断，请重试" } })),
      };
    }
    void pending.current.promise.then((result) => {
      if (!active) return;
      busy.current = false;
      const data = result.ok
        ? mergeRealtimeIncome(snapshots.current.get(key) ?? null, result.value, requestedIds)
        : result.error.kind === "session_expired"
          ? null
          : (snapshots.current.get(key) ?? null);
      if (data) {
        snapshots.current.delete(key);
        snapshots.current.set(key, data);
        while (snapshots.current.size > 4) snapshots.current.delete(snapshots.current.keys().next().value as string);
      } else snapshots.current.delete(key);
      setState({
        key,
        loading: false,
        error: result.ok ? null : result.error,
        data,
      });
    });
    return () => {
      active = false;
    };
  }, [key, idsKey, account, date, request]);

  /** Ignore repeat refreshes while a request is pending and keep the current day visible */
  const reload = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setRequest((old) => ({ version: old.version + 1, key, ids: null }));
  }, [key]);

  /** Retry only failed resources; a new date or account cannot reuse this selection */
  const retryFailures = () => {
    if (state.key !== key || state.loading || !state.data?.failedResourceIds.length) return;
    setRequest((old) => ({ version: old.version + 1, key, ids: state.data?.failedResourceIds ?? null }));
  };

  return {
    ...(state.key === key ? state : { key, data: snapshots.current.get(key) ?? null, error: null, loading: true }),
    reload,
    retryFailures,
  };
}
