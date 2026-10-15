import type { RpcError, RpcMethod, RpcMethods, RpcResult } from "@glaze/contracts";
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
 * Replay of the same effect shares its request; obsolete and unmounted responses are ignored
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
  const pending = useRef<{ key: string; promise: Promise<RpcResult<RpcMethods[M]["result"]>> } | null>(null);
  const loadedAccount = useRef<string | null>(null);
  const paramsKey = JSON.stringify(params ?? null);
  const accountId = current?.id ?? null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Never show one account's data under another account
    if (loadedAccount.current !== accountId) {
      loadedAccount.current = accountId;
      setData(null);
      setError(null);
    }
    const key = JSON.stringify([method, paramsKey, accountId, version]);
    if (pending.current?.key !== key) {
      pending.current = {
        key,
        promise: Promise.resolve()
          .then(() => callHost(method, JSON.parse(paramsKey) ?? undefined))
          .catch((error: unknown) => ({
            ok: false as const,
            error: { kind: "internal", message: error instanceof Error ? error.message : "查询失败，请重试" },
          })),
      };
    }
    void pending.current.promise.then((result) => {
      if (!active) {
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
    return () => {
      active = false;
    };
  }, [method, paramsKey, accountId, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, error, loading, reload };
}
