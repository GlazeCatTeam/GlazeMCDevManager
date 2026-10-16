import type { RankBoard, RankCategory, RankChange, RankEntry, RankPage } from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { readArray, readNumber, readRecord, readString } from "../http/parse";
import { getRankIcons } from "./rank-images";

// Category ids used by the supported mobile leaderboards
const peFirstType: Record<RankCategory, number> = { mod: 2, map: 1, texture: 3, lobby: 6 };

const boardPaths: Record<RankBoard, string> = {
  pe_hot: "/square/us_rank_list/?type=pe_hot",
  hot_search: "/square/us_rank_list/?type=hot_search",
  pe_download: "/square/rank_list/?type=pe_download",
  pe_sell: "/square/rank_list/?type=pe_sell",
};

/** Category id a board expects; hot search has no categories */
function firstType(board: RankBoard, category: RankCategory): number {
  if (board === "hot_search") {
    return 0;
  }
  return peFirstType[category];
}

/** Movement from the previous rank; only missing or non-positive positions mean newly ranked */
function changeFrom(rank: number, previous: number | null): RankChange {
  if (previous === null || previous <= 0) {
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
    const title = typeof row.content === "string" && !row.content.trim() ? "（空搜索词）" : readString(row.content);
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
  // Sales endpoints restart row.rank at 1 on each page; position includes the requested offset
  const rank = position;
  // rank_change is the previous rank minus the current one, so positive means the work moved up
  const delta = readNumber(row.rank_change);
  return title === null
    ? null
    : {
        rank,
        title,
        itemId: readString(row.item_id),
        iconUrl: readString(row.icon_url),
        change: changeFrom(rank, delta === null ? null : rank + delta),
      };
}

/** Read one bounded page, preserving absolute positions and authoritative pagination metadata */
export async function getRankPage(
  session: NeteaseSession,
  board: RankBoard,
  category: RankCategory,
  start: number,
  limit: number,
): Promise<Result<RankPage>> {
  if (!Object.hasOwn(boardPaths, board)) return fail({ kind: "business", code: "validation", message: "榜单类型无效" });
  if (!Number.isInteger(start) || start < 0 || start > 1_000_000 || !Number.isInteger(limit) || limit < 1 || limit > 50)
    return fail({ kind: "business", code: "validation", message: "榜单分页参数无效" });
  const path = withQuery(boardPaths[board], { start, span: limit, first_type: firstType(board, category) });
  const result = await getMcDevData(`rank.${board}`, path, session);
  if (!result.ok) {
    return result;
  }
  const raw = readRecord(result.value);
  const rows = readArray(raw.data);
  const total = readNumber(raw.count);
  if (rows === null || rows.length > limit || total === null || !Number.isSafeInteger(total) || total < 0) {
    return fail({ kind: "parse", endpoint: `rank.${board}` });
  }
  const entries: RankEntry[] = [];
  for (const [index, row] of rows.entries()) {
    const entry = readEntry(board, row, start + index + 1);
    if (entry === null) {
      return fail({ kind: "parse", endpoint: `rank.${board}` });
    }
    entries.push(entry);
  }
  const visible = entries.slice(0, limit);
  if (board.startsWith("pe_")) {
    const icons = await getRankIcons(
      visible.flatMap((entry) => (!entry.iconUrl && entry.itemId ? [entry.itemId] : [])),
    );
    for (const entry of visible) entry.iconUrl ??= icons.get(entry.itemId ?? "") ?? null;
  }
  const next = start + visible.length;
  return ok({ items: visible, total, nextStart: visible.length === limit && next < total ? next : null });
}

/** Preserve the top-N capability for existing callers while sharing the real pagination adapter */
export async function getRankList(
  session: NeteaseSession,
  board: RankBoard,
  category: RankCategory,
  limit: number,
): Promise<Result<RankEntry[]>> {
  const result = await getRankPage(session, board, category, 0, limit);
  return result.ok ? ok(result.value.items) : result;
}
