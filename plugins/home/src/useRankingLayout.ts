import { callHost, defaultRankingBoards, onHostEvent, type RankBoard } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

/** Persist visible leaderboard tabs and refresh them when settings restores defaults */
export function useRankingLayout() {
  const [boards, setBoards] = useState<RankBoard[]>([...defaultRankingBoards]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const writing = useRef(false);
  const mounted = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly retries a failed host read
  useEffect(() => {
    let active = true;
    let changed = false;
    mounted.current = true;
    setBusy(true);
    const unsubscribe = onHostEvent("layout.rankingChanged", (value) => {
      changed = true;
      setBoards(value);
      setError("");
    });
    void callHost("layout.getRanking")
      .then((result) => {
        if (!active || changed) return;
        if (!result.ok) throw new Error(result.error.message);
        setBoards(result.value);
        setError("");
      })
      .catch((reason: unknown) => {
        if (active && !changed) setError(`排版读取失败：${reason instanceof Error ? reason.message : "请重试"}`);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      mounted.current = false;
      unsubscribe();
    };
  }, [revision]);

  /** Save before changing the visible tabs, so failed writes leave the layout intact */
  const save = useCallback(async (next: RankBoard[]) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      const result = await callHost("layout.setRanking", next);
      if (!result.ok) throw new Error(result.error.message);
      if (mounted.current) {
        setBoards(result.value);
        setError("");
      }
    } catch (reason) {
      if (mounted.current) setError(`排版保存失败：${reason instanceof Error ? reason.message : "请重试"}`);
    } finally {
      writing.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { boards, busy, error, save, retry: () => setRevision((value) => value + 1) };
}
