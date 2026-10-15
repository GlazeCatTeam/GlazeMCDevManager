import { type AnalyticsRealtime, callHost, type HostQuery, type RpcResult, useSession } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeRealtimeIncome } from "./realtime-income";

type QueryState = Omit<HostQuery<AnalyticsRealtime>, "reload"> & { key: string };

/** Query one account and day, retaining successful resources during targeted retries */
export function useRealtimeIncome(date: string, resourceIds: string[]) {
  const { current } = useSession();
  const account = current?.id;
  const idsKey = JSON.stringify(resourceIds);
  const key = JSON.stringify([account, current?.lastLoginAt, date, idsKey]);
  const [request, setRequest] = useState({ version: 0, key, ids: null as string[] | null });
  const [state, setState] = useState<QueryState>({ key, data: null, error: null, loading: true });
  const pending = useRef<{ key: string; promise: Promise<RpcResult<AnalyticsRealtime>> } | null>(null);
  const scope = useRef(key);

  useEffect(() => {
    let active = true;
    // Returning to an earlier date starts a full query, even if its last action was a retry
    const scopeChanged = scope.current !== key;
    scope.current = key;
    const requestedIds: string[] = !scopeChanged && request.key === key && request.ids ? request.ids : JSON.parse(idsKey);
    const requestKey = JSON.stringify([key, request.version, requestedIds]);
    setState((old) => ({ key, data: old.key === key ? old.data : null, loading: true, error: null }));
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
      setState((old) => ({
        key,
        loading: false,
        error: result.ok ? null : result.error,
        data: result.ok
          ? mergeRealtimeIncome(old.key === key ? old.data : null, result.value, requestedIds)
          : result.error.kind === "session_expired" ? null : old.key === key ? old.data : null,
      }));
    });
    return () => {
      active = false;
    };
  }, [key, idsKey, account, date, request]);

  /** Full refresh supersedes an in-flight retry and keeps the current day visible */
  const reload = useCallback(() => {
    setRequest((old) => ({ version: old.version + 1, key, ids: null }));
  }, [key]);

  /** Retry only failed resources; a new date or account cannot reuse this selection */
  const retryFailures = () => {
    if (state.key !== key || state.loading || !state.data?.failedResourceIds.length) return;
    setRequest((old) => ({ version: old.version + 1, key, ids: state.data?.failedResourceIds ?? null }));
  };

  return {
    ...(state.key === key ? state : { key, data: null, error: null, loading: true }),
    reload,
    retryFailures,
  };
}
