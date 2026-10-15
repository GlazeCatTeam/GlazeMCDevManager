import type { RpcError, RpcMethod, RpcMethods } from "@glaze/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { callHost, useSession } from "../context/session";

export interface HostQuery<T> {
  /** Last successful result; kept while reloading so a refresh does not blank the UI */
  data: T | null;
  /** Error of the latest attempt; null after a success */
  error: RpcError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Load a read capability and reload it when its params or the current account change.
 * Responses that arrive after a newer request started are ignored
 */
export function useHostQuery<M extends RpcMethod>(
  method: M,
  params?: RpcMethods[M]["params"],
): HostQuery<RpcMethods[M]["result"]> {
  const { current } = useSession();
  const [data, setData] = useState<RpcMethods[M]["result"] | null>(null);
  const [error, setError] = useState<RpcError | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const latest = useRef(0);
  const loadedAccount = useRef<string | null>(null);
  const paramsKey = JSON.stringify(params ?? null);
  const accountId = current?.id ?? null;

  useEffect(() => {
    const request = latest.current + 1;
    latest.current = request;
    setLoading(true);
    // Never show one account's data under another account
    if (loadedAccount.current !== accountId) {
      loadedAccount.current = accountId;
      setData(null);
      setError(null);
    }
    // version is a dependency only to trigger a reload
    void version;
    callHost(method, JSON.parse(paramsKey) ?? undefined).then((result) => {
      if (latest.current !== request) {
        return;
      }
      if (result.ok) {
        setData(result.value);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
  }, [method, paramsKey, accountId, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, error, loading, reload };
}
