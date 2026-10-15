import { type HostQuery, type RpcMethods, useSession } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { type HomeMethod, homeEntry, readHome } from "./home-query";

/** Cached home reads with immediate key isolation and shared intent prefetch */
export function useHomeQuery<M extends HomeMethod>(
  method: M,
  params?: RpcMethods[M]["params"],
): HostQuery<RpcMethods[M]["result"]> & { prefetch: (next: RpcMethods[M]["params"]) => void } {
  const { current } = useSession();
  const account = current?.id;
  const sessionKey = JSON.stringify([account, current?.lastLoginAt, current?.status === "expired"]);
  const paramsKey = JSON.stringify({ ...params, account });
  const key = JSON.stringify([sessionKey, method, paramsKey]);
  const entry = homeEntry(key);
  const subscribe = useCallback(
    (notify: () => void) => {
      entry.listeners.add(notify);
      return () => {
        entry.listeners.delete(notify);
      };
    },
    [entry],
  );
  const snapshot = useSyncExternalStore(subscribe, () => entry.snapshot);
  useEffect(() => {
    void readHome(key, method, JSON.parse(paramsKey));
  }, [key, method, paramsKey]);
  const reload = useCallback(() => {
    void readHome(key, method, JSON.parse(paramsKey), true);
  }, [key, method, paramsKey]);
  const prefetch = useCallback(
    (next: RpcMethods[M]["params"]) => {
      const nextParams = { ...next, account };
      const nextKey = JSON.stringify([sessionKey, method, JSON.stringify(nextParams)]);
      void readHome(nextKey, method, nextParams);
    },
    [sessionKey, method, account],
  );
  return { ...snapshot, data: snapshot.data as RpcMethods[M]["result"] | null, reload, prefetch };
}
