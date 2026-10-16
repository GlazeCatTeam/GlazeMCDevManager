import {
  type AnalyticsRealtime,
  callHost,
  type HostQuery,
  onHostEvent,
  type RpcResult,
  useSession,
} from "@glaze/plugin-sdk";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { mergeRealtimeIncome } from "./realtime-income";
import { AnalysisActivity, useAnalysisEpoch } from "./useAnalyticsQuery";

type QueryState = Omit<HostQuery<AnalyticsRealtime>, "reload"> & { key: string };
const retainedSnapshots = new Map<string, AnalyticsRealtime>();
const pendingReads = new Map<string, Promise<RpcResult<AnalyticsRealtime>>>();

/** Rejoining an in-flight account/day query avoids duplicate requests after navigation */
function readRealtime(key: string, load: () => Promise<RpcResult<AnalyticsRealtime>>) {
  const existing = pendingReads.get(key);
  if (existing) return existing;
  const promise = Promise.resolve()
    .then(load)
    .catch(
      (): RpcResult<AnalyticsRealtime> => ({
        ok: false,
        error: { kind: "internal", message: "实时收益请求中断，请重试" },
      }),
    )
    .finally(() => pendingReads.delete(key));
  pendingReads.set(key, promise);
  return promise;
}

/** Query one account and day, retaining successful resources during targeted retries */
export function useRealtimeIncome(date: string, resourceIds: string[]) {
  const { current } = useSession();
  const visible = useContext(AnalysisActivity);
  const account = current?.id;
  const epoch = useAnalysisEpoch();
  const snapshots = useRef(retainedSnapshots);
  const busy = useRef(false);
  const idsKey = JSON.stringify(resourceIds);
  const key = JSON.stringify([account, current?.lastLoginAt, epoch, date, idsKey]);
  const [request, setRequest] = useState({ version: 0, key, ids: null as string[] | null });
  const [state, setState] = useState<QueryState>({
    key,
    data: snapshots.current.get(key) ?? null,
    error: null,
    loading: true,
  });
  const pending = useRef<{ key: string; settled: boolean; promise: Promise<RpcResult<AnalyticsRealtime>> } | null>(
    null,
  );
  const scope = useRef(key);

  useEffect(
    () =>
      onHostEvent("cache.cleared", () => {
        snapshots.current.clear();
      }),
    [],
  );

  useEffect(() => {
    if (!visible) {
      busy.current = false;
      scope.current = "";
      return;
    }
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
    const timer = window.setTimeout(
      () => {
        if (pending.current?.key !== requestKey || pending.current.settled) {
          pending.current = {
            key: requestKey,
            settled: false,
            promise: readRealtime(JSON.stringify([key, requestedIds]), () => {
              if (!account)
                return Promise.resolve({
                  ok: false as const,
                  error: { kind: "not_found", message: "请先登录开发者账号" },
                });
              return callHost("analytics.realtime", { account, date, resourceIds: requestedIds });
            }),
          };
        }
        const running = pending.current;
        void running.promise.then((result) => {
          running.settled = true;
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
            while (snapshots.current.size > 4)
              snapshots.current.delete(snapshots.current.keys().next().value as string);
          } else snapshots.current.delete(key);
          setState({
            key,
            loading: false,
            error: result.ok ? null : result.error,
            data,
          });
        });
      },
      scopeChanged ? 180 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [key, idsKey, account, date, request, visible]);

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
