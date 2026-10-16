import { type CommentListParams, type CommentPage, callHost, onHostEvent, type RpcError } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import type { CommentPageCache } from "./comment-cache";
import { commentQueryKey, loadCommentPage } from "./comment-query";

interface CommentQuery {
  data: CommentPage | null;
  error: RpcError | null;
  loading: boolean;
  partial: boolean;
  progress: { scanned: number; total: number; matched: number } | null;
}

/** Keep cached rows visible and publish rating matches as source batches arrive */
export function useComments(
  params: CommentListParams,
  revision: number,
  cache: CommentPageCache,
  stars: number[] = [],
): CommentQuery {
  const paramsKey = commentQueryKey(params, stars);
  const [changes, setChanges] = useState(0);
  // Replies sent by an AI tool or another window drop cached pages; current rows stay until the reload lands
  useEffect(() => {
    try {
      return onHostEvent("data.changed", ({ modules }) => {
        if (!modules.includes("comments")) return;
        cache.clear();
        setChanges((value) => value + 1);
      });
    } catch {
      return undefined;
    }
  }, [cache]);
  const [query, setQuery] = useState<CommentQuery & { key: string }>(() => ({
    key: paramsKey,
    data: cache.peek(paramsKey),
    error: null,
    loading: !cache.fresh(paramsKey),
    partial: false,
    progress: null,
  }));
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void revision;
    void changes;
    setQuery((current) => ({
      key: paramsKey,
      data: cache.peek(paramsKey) ?? (current.key === paramsKey ? current.data : null),
      error: null,
      loading: !cache.fresh(paramsKey),
      partial: current.key === paramsKey && current.partial,
      progress: null,
    }));
    const { stars: ratings = [], ...source } = JSON.parse(paramsKey);
    const load = () =>
      loadCommentPage(
        cache,
        source,
        ratings,
        (input) => callHost("comments.list", input),
        (progress) => {
          if (!active) return;
          setQuery((current) => {
            const previous = current.key === paramsKey ? current.data : null;
            const data =
              previous && !current.partial
                ? previous
                : progress.data.items.length || !previous?.items.length
                  ? progress.data
                  : previous;
            return {
              key: paramsKey,
              data,
              error: null,
              loading: true,
              partial: data === progress.data || current.partial,
              progress: { scanned: progress.scanned, total: progress.total, matched: progress.data.total },
            };
          });
        },
        controller.signal,
      );
    // Subscribe on every effect, including StrictMode replay, even when the source scan is shared
    const pending = ratings.length ? load() : cache.read(paramsKey, load);
    pending.then((result) => {
      if (!active) return;
      setQuery((current) => ({
        key: paramsKey,
        data: result.ok ? result.value : current.key === paramsKey ? current.data : cache.peek(paramsKey),
        error: result.ok ? null : result.error,
        loading: false,
        partial: !result.ok && current.partial,
        progress: result.ok ? null : current.progress,
      }));
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [paramsKey, revision, cache, changes]);
  return query.key === paramsKey
    ? query
    : { data: cache.peek(paramsKey), error: null, loading: !cache.fresh(paramsKey), partial: false, progress: null };
}
