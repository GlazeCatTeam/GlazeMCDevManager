import type { RankBoard, RankCategory, RankChange, RankEntry } from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { readArray, readNumber, readRecord, readString } from "../http/parse";

/** Boards list at most this many entries; anything ranked lower last time counts as new */
const BOARD_SIZE = 50;

// Platform category ids differ between mobile (PE) and PC boards
const peFirstType: Record<RankCategory, number> = { mod: 2, map: 1, texture: 3, lobby: 6 };
const pcFirstType: Record<RankCategory, number> = { mod: 3, map: 5, texture: 4, lobby: 11 };

const boardPaths: Record<RankBoard, string> = {
  pe_hot: "/square/us_rank_list/?type=pe_hot",
  hot_search: "/square/us_rank_list/?type=hot_search",
  pe_download: "/square/rank_list/?type=pe_download",
  pe_sell: "/square/rank_list/?type=pe_sell",
  pc_download: "/square/rank_list/?type=pc_download",
  pc_like: "/square/rank_list/?type=pc_like",
};

/** Category id a board expects; hot search has no categories */
function firstType(board: RankBoard, category: RankCategory): number {
  if (board === "hot_search") {
    return 0;
  }
  return board.startsWith("pc_") ? pcFirstType[category] : peFirstType[category];
}

/** Movement from the previous rank; a missing or out-of-board previous rank means new */
function changeFrom(rank: number, previous: number | null): RankChange {
  if (previous === null || previous <= 0 || previous > BOARD_SIZE) {
    return { kind: "new" };
  }
  if (previous === rank) {
    return { kind: "flat" };
  }
  return previous > rank ? { kind: "up", value: previous - rank } : { kind: "down", value: rank - previous };
}

/** One board entry from a raw row; boards use different field sets */
function readEntry(board: RankBoard, row: Record<string, unknown>, position: number): RankEntry | null {
  if (board === "hot_search") {
    const title = readString(row.content);
    const rank = readNumber(row.rank) ?? position;
    return title === null
      ? null
      : { rank, title, itemId: null, iconUrl: null, change: changeFrom(rank, readNumber(row.last_rank)) };
  }
  if (board === "pe_hot") {
    const title = readString(row.res_name);
    const rank = position;
    return title === null
      ? null
      : {
          rank,
          title,
          itemId: readString(row.iid),
          iconUrl: readString(row.icon_url),
          change: changeFrom(rank, readNumber(row.last_rank)),
        };
  }
  const title = readString(row.item_name);
  const rank = readNumber(row.rank) ?? position;
  // rank_change is the previous rank minus the current one, so positive means the work moved up
  const delta = readNumber(row.rank_change);
  return title === null
    ? null
    : {
        rank,
        title,
        itemId: readString(row.item_id),
        iconUrl: null,
        change: changeFrom(rank, delta === null ? null : rank + delta),
      };
}

/** Top entries of a platform leaderboard */
export async function getRankList(
  session: NeteaseSession,
  board: RankBoard,
  category: RankCategory,
  limit: number,
): Promise<Result<RankEntry[]>> {
  const path = withQuery(boardPaths[board], { start: 0, span: limit, first_type: firstType(board, category) });
  const result = await getMcDevData(`rank.${board}`, path, session);
  if (!result.ok) {
    return result;
  }
  const rows = readArray(readRecord(result.value).data);
  if (rows === null) {
    return fail({ kind: "parse", endpoint: `rank.${board}` });
  }
  const entries: RankEntry[] = [];
  for (const [index, row] of rows.entries()) {
    const entry = readEntry(board, row, index + 1);
    if (entry === null) {
      return fail({ kind: "parse", endpoint: `rank.${board}` });
    }
    entries.push(entry);
  }
  return ok(entries.slice(0, limit));
}
