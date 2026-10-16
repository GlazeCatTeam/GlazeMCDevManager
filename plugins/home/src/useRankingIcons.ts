import type { RankEntry, RpcMethods } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import { homeEntry, readHome } from "./home-query";

/** Fill covers independently of page identity, with shared batch reads and stale-response isolation */
export function useRankingIcons(rows: RankEntry[], scope: string): RankEntry[] {
  const [covers, setCovers] = useState<{ scope: string; urls: Record<string, string> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ids = [
      ...new Set(
        rows.flatMap((row) => (!row.iconUrl && row.itemId && /^\d{1,32}$/.test(row.itemId) ? [row.itemId] : [])),
      ),
    ];
    for (let start = 0; start < ids.length; start += 50) {
      const itemIds = ids.slice(start, start + 50);
      const key = JSON.stringify([scope, "rank.icons", itemIds]);
      void readHome(key, "rank.icons", { itemIds }).then(() => {
        if (cancelled) return;
        const urls = homeEntry(key).snapshot.data as RpcMethods["rank.icons"]["result"] | null;
        if (!urls || !Object.keys(urls).length) return;
        setCovers((previous) => ({ scope, urls: { ...(previous?.scope === scope ? previous.urls : {}), ...urls } }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [rows, scope]);
  return rows.map((row) =>
    !row.iconUrl && row.itemId && covers?.scope === scope && covers.urls[row.itemId]
      ? { ...row, iconUrl: covers.urls[row.itemId] as string }
      : row,
  );
}
