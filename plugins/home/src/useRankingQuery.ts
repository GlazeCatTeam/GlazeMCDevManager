import {
  callHost,
  type RankBoard,
  type RankCategory,
  type RankPage,
  type RpcError,
  useSession,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RANK_LIMIT } from "./boards";
import { useHomeQuery } from "./useHomeQuery";
import { useRankingIcons } from "./useRankingIcons";

interface MoreRows {
  key: string;
  first: RankPage;
  items: RankPage["items"];
  nextStart: number | null;
  loading: boolean;
  error: RpcError | null;
}

/** Show text before covers and preserve successful pages while background reads are in progress */
export function useRankingQuery(board: RankBoard, category: RankCategory) {
  const { current } = useSession();
  const account = current?.id;
  const key = JSON.stringify([account, current?.lastLoginAt, board, category]);
  const first = useHomeQuery("rank.page", { board, category, start: 0, limit: RANK_LIMIT, includeIcons: false });
  const [more, setMore] = useState<MoreRows | null>(null);
  const epoch = useRef(0);
  const pending = useRef<{ key: string; data: RankPage } | null>(null);
  const latest = useRef({ key, data: first.data });
  latest.current = { key, data: first.data };
  const active = more?.key === key && more.first === first.data ? more : null;
  const nextStart = active ? active.nextStart : (first.data?.nextStart ?? null);
  const rows = useMemo(() => [...(first.data?.items ?? []), ...(active?.items ?? [])], [first.data, active?.items]);
  const items = useRankingIcons(rows, key);

  // Cancel appended-page state when leaving a board, including a rapid return to its cached first page
  useEffect(() => {
    void key;
    setMore(null);
    return () => {
      epoch.current++;
      pending.current = null;
    };
  }, [key]);

  /** Retain all loaded rows until refresh succeeds and prevent older appends from returning */
  const reload = useCallback(() => {
    epoch.current++;
    pending.current = null;
    setMore((previous) => (previous ? { ...previous, loading: false, error: null } : null));
    first.reload();
  }, [first.reload]);

  /** Append at most one page per observer notification and keep loaded rows when a later page fails */
  const loadMore = async () => {
    const data = first.data;
    if (!data || first.loading || nextStart === null || active?.loading) return;
    const request = { key, data };
    const previous = pending.current;
    if (previous?.key === key && previous.data === data) return;
    pending.current = request;
    const generation = epoch.current;
    const base: MoreRows = { key, first: data, items: active?.items ?? [], nextStart, loading: true, error: null };
    setMore(base);
    try {
      const result = await callHost("rank.page", {
        account,
        board,
        category,
        start: nextStart,
        limit: RANK_LIMIT,
        includeIcons: false,
      });
      if (generation !== epoch.current || latest.current.key !== key || latest.current.data !== data) return;
      if (result.ok) {
        setMore({
          ...base,
          items: [...base.items, ...result.value.items],
          nextStart: result.value.nextStart,
          loading: false,
        });
      } else setMore({ ...base, loading: false, error: result.error });
    } catch {
      if (generation === epoch.current && latest.current.key === key && latest.current.data === data)
        setMore({ ...base, loading: false, error: { kind: "network", message: "后续榜单加载失败，请重试" } });
    } finally {
      if (pending.current === request) pending.current = null;
    }
  };

  return {
    ...first,
    key,
    items,
    nextStart,
    moreLoading: active?.loading ?? false,
    moreError: active?.error ?? null,
    loadMore,
    reload,
  };
}
