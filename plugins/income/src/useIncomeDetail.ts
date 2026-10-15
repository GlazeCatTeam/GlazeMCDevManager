import type { RpcError } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import type { IncomeDetailCache } from "./detail-cache";

/** Reuse page-local details across expansions and ignore responses from closed rows */
export function useIncomeDetail(cache: IncomeDetailCache, id: string) {
  const [data, setData] = useState(() => cache.peek(id));
  const [loading, setLoading] = useState(() => !cache.fresh(id));
  const [error, setError] = useState<RpcError | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(!cache.fresh(id));
    if (revision > 0) setError(null);
    void cache.read(id).then((result) => {
      if (!active) return;
      if (result.ok) {
        setData(result.value);
        setError(null);
      } else setError(result.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [cache, id, revision]);

  /** Retry only this detail while preserving its last successful data */
  function reload() {
    cache.invalidate(id);
    setRevision((value) => value + 1);
  }

  return { data, loading, error, reload };
}
