import type { CommentListParams, PlayerComment } from "@glaze/plugin-sdk";
import type { CommentEntry } from "./types";

export const commentDateRanges = ["今天", "近 7 天", "近 30 天", "近 90 天", "全部"] as const;
export type CommentDateRange = (typeof commentDateRanges)[number];
export const COMMENTS_PER_PAGE = 20;

/** Format a local calendar date without UTC shifting its day */
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Include today in the selected number of calendar days */
export function commentDates(
  range: CommentDateRange,
  now = new Date(),
): Pick<CommentListParams, "startDate" | "endDate"> {
  if (range === "全部") return {};
  const days = { 今天: 1, "近 7 天": 7, "近 30 天": 30, "近 90 天": 90 }[range];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - days + 1);
  return { startDate: dateKey(start), endDate: dateKey(now) };
}

/** Adapt platform comments and known replies to the shared list and detail metadata */
export function commentEntry(comment: PlayerComment): CommentEntry {
  const date = new Date(comment.publishTime * 1000);
  return {
    ...comment,
    createdAt: `${dateKey(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}
