import { type CommentListParams, type CommentPage, callHost, type RpcError } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import type { CommentPageCache } from "./comment-cache";

interface CommentQuery {
  data: CommentPage | null;
  error: RpcError | null;
  loading: boolean;
}

/** Show cached pages immediately, coalesce reads and isolate results by their complete query key */
export function useComments(params: CommentListParams, revision: number, cache: CommentPageCache): CommentQuery {
  const paramsKey = JSON.stringify(params);
  const [query, setQuery] = useState<CommentQuery & { key: string }>(() => ({
    key: paramsKey,
    data: cache.peek(paramsKey),
    error: null,
    loading: !cache.fresh(paramsKey),
  }));
  useEffect(() => {
    let active = true;
    void revision;
    setQuery((current) => ({
      key: paramsKey,
      data: cache.peek(paramsKey) ?? (current.key === paramsKey ? current.data : null),
      error: null,
      loading: !cache.fresh(paramsKey),
    }));
    cache
      .read(paramsKey, () => callHost("comments.list", JSON.parse(paramsKey)))
      .then((result) => {
        if (!active) return;
        setQuery((current) => ({
          key: paramsKey,
          data: result.ok ? result.value : (cache.peek(paramsKey) ?? (current.key === paramsKey ? current.data : null)),
          error: result.ok ? null : result.error,
          loading: false,
        }));
      });
    return () => {
      active = false;
    };
  }, [paramsKey, revision, cache]);
  return query.key === paramsKey
    ? query
    : { data: cache.peek(paramsKey), error: null, loading: !cache.fresh(paramsKey) };
}
