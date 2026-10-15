import { type CommentListParams, type CommentPage, callHost, type RpcError } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import type { CommentPageCache } from "./comment-cache";
import { commentQueryKey, loadCommentPage } from "./comment-query";

interface CommentQuery {
  data: CommentPage | null;
  error: RpcError | null;
  loading: boolean;
}

/** Cache complete queries and apply rating filters before calculating display pages */
export function useComments(
  params: CommentListParams,
  revision: number,
  cache: CommentPageCache,
  stars: number[] = [],
): CommentQuery {
  const paramsKey = commentQueryKey(params, stars);
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
    const { stars: ratings = [], ...source } = JSON.parse(paramsKey);
    cache
      .read(paramsKey, () => loadCommentPage(cache, source, ratings, (input) => callHost("comments.list", input)))
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
