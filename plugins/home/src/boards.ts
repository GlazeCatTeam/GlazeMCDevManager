import type { RankBoard, RankCategory } from "@glaze/plugin-sdk";

// Leaderboards shown on the home page, in tab order

export const rankBoards: readonly { board: RankBoard; label: string }[] = [
  { board: "pe_hot", label: "手游热门飙升" },
  { board: "hot_search", label: "热搜榜" },
  { board: "pe_download", label: "手游免费榜" },
  { board: "pe_sell", label: "手游畅销榜" },
];

export const rankCategories: readonly { category: RankCategory; label: string }[] = [
  { category: "mod", label: "模组" },
  { category: "map", label: "地图" },
  { category: "texture", label: "材质光影" },
  { category: "lobby", label: "联机大厅" },
];

/** Real entries fetched per scroll batch; subsequent batches are loaded at the end of the list */
export const RANK_LIMIT = 50;
