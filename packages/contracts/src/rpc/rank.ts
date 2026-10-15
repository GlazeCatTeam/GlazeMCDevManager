import type { AccountParams } from "./developer";

// Platform leaderboard capability

/** pe_hot: 手游热门飙升; hot_search: 热搜 (search terms, not works); the rest are sales boards */
export type RankBoard = "pe_hot" | "hot_search" | "pe_download" | "pe_sell" | "pc_download" | "pc_like";

/** Work category; ignored by hot_search */
export type RankCategory = "mod" | "map" | "texture" | "lobby";

export type RankChange = { kind: "up" | "down"; value: number } | { kind: "new" } | { kind: "flat" };

export interface RankEntry {
  rank: number;
  /** Work name, or the search term on hot_search */
  title: string;
  /** null on hot_search */
  itemId: string | null;
  iconUrl: string | null;
  change: RankChange;
}

export interface RankListParams extends AccountParams {
  board: RankBoard;
  /** Defaults to "mod" */
  category?: RankCategory | undefined;
  /** 1 to 50, defaults to 10 */
  limit?: number | undefined;
}

export interface RankPageParams extends RankListParams {
  /** Zero-based offset in the selected leaderboard */
  start?: number | undefined;
}

export interface RankPage {
  items: RankEntry[];
  total: number;
  /** null when the platform has no further rows */
  nextStart: number | null;
}
