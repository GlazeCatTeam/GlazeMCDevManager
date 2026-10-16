import { type CommentListParams, type CommentPage, callHost, onHostEvent, type RpcError } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import type { CommentPageCache } from "./comment-cache";
import { commentQueryKey, loadCommentPage } from "./comment-query";

interface CommentQuery {
  data: CommentPage | null;
  dataKey: string;
  isPreviousData: boolean;
  error: RpcError | null;
  loading: boolean;
  partial: boolean;
  progress: { scanned: number; total: number; matched: number } | null;
}

/** Retain the displayed snapshot until a new query has usable rows, ignoring obsolete responses */
export function useComments(
  params: CommentListParams,
  revision: number,
  cache: CommentPageCache,
  stars: number[] = [],
  hideEmpty = false,
): CommentQuery {
  const paramsKey = commentQueryKey(params, stars, hideEmpty);
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
    dataKey: paramsKey,
    isPreviousData: false,
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
    setQuery((current) => {
      const cached = cache.peek(paramsKey);
      const dataKey = cached ? paramsKey : current.dataKey;
      return {
        key: paramsKey,
        data: cached ?? current.data,
        dataKey,
        isPreviousData: dataKey !== paramsKey,
        error: null,
        loading: !cache.fresh(paramsKey),
        partial: !cached && current.partial,
        progress: null,
      };
    });
    const { stars: ratings = [], hideEmpty: excludeEmpty = false, ...source } = JSON.parse(paramsKey);
    const load = () =>
      loadCommentPage(
        cache,
        source,
        ratings,
        (input) => callHost("comments.list", input),
        (progress) => {
          if (!active) return;
          setQuery((current) => {
            // Keep a complete snapshot during refresh, and avoid flashing an empty list between filters
            const keep =
              current.data &&
              ((current.dataKey === paramsKey && !current.partial) ||
                (!progress.data.items.length && progress.scanned < progress.total));
            const dataKey = keep ? current.dataKey : paramsKey;
            return {
              key: paramsKey,
              data: keep ? current.data : progress.data,
              dataKey,
              isPreviousData: dataKey !== paramsKey,
              error: null,
              loading: true,
              partial: keep ? current.partial : true,
              progress: { scanned: progress.scanned, total: progress.total, matched: progress.data.total },
            };
          });
        },
        controller.signal,
        excludeEmpty,
      );
    // Subscribe on every effect, including StrictMode replay, even when the source scan is shared
    const pending = ratings.length || excludeEmpty ? load() : cache.read(paramsKey, load);
    pending.then((result) => {
      if (!active) return;
      setQuery((current) => ({
        key: paramsKey,
        data: result.ok ? result.value : current.data,
        dataKey: result.ok ? paramsKey : current.dataKey,
        isPreviousData: !result.ok && current.dataKey !== paramsKey,
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
  if (query.key === paramsKey) return query;
  const cached = cache.peek(paramsKey);
  return {
    ...query,
    data: cached ?? query.data,
    dataKey: cached ? paramsKey : query.dataKey,
    isPreviousData: !cached && query.dataKey !== paramsKey,
    error: null,
    loading: !cache.fresh(paramsKey),
    partial: !cached && query.partial,
    progress: null,
  };
}
