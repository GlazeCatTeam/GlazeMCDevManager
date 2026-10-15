import {
  type CommentListParams,
  type CommentPage,
  type CommentReplyParams,
  isCommentListParams,
  isCommentReplyParams,
  type PlayerComment,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery, writeMcDevData } from "../http/client";
import { readArray, readNumber, readRecord, readString } from "../http/parse";

/** Decode comment rows and optional official reply fields without inventing reply timestamps */
export function readCommentPage(value: unknown): Result<CommentPage> {
  const raw = readRecord(value);
  const total = readNumber(raw.count);
  const rows = readArray(raw.data);
  if (total === null || !Number.isSafeInteger(total) || total < 0 || rows === null || rows.length > total)
    return fail({ kind: "parse", endpoint: "comments.list" });
  const items: PlayerComment[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const id = readString(row._id);
    const resourceId = readString(row.iid);
    const nickname = readString(row.nickname);
    const uid = readString(row.uid);
    const work = readString(row.res_name);
    const stars = readNumber(row.stars);
    const publishTime = readNumber(row.publish_time);
    if (
      !id ||
      ids.has(id) ||
      !resourceId ||
      !nickname ||
      !uid ||
      !work ||
      stars === null ||
      !Number.isInteger(stars) ||
      stars < 0 ||
      stars > 5 ||
      publishTime === null ||
      !Number.isSafeInteger(publishTime) ||
      publishTime < 0 ||
      !Number.isFinite(new Date(publishTime * 1000).getTime()) ||
      typeof row.user_comment !== "string" ||
      typeof row.comment_tag !== "string"
    )
      return fail({ kind: "parse", endpoint: "comments.list" });
    ids.add(id);
    const replies = readArray(row.developer_reply);
    const replyContent = readString(replies?.[0]?.comment);
    const hasReply = (replies?.length ?? 0) > 0 || (readNumber(row.commented_num) ?? 0) > 0;
    items.push({
      id,
      resourceId,
      nickname,
      uid,
      work,
      stars,
      publishTime,
      content: row.user_comment,
      tag: row.comment_tag,
      canReply: !hasReply,
      ...(replyContent ? { reply: { content: replyContent, createdAt: "" } } : {}),
    });
  }
  return ok({ total, items });
}

/** Send a user-initiated reply once; never retry writes after an uncertain response */
export async function replyComment(session: NeteaseSession, params: CommentReplyParams): Promise<Result<undefined>> {
  if (!isCommentReplyParams(params))
    return fail({ kind: "business", code: "validation", message: "评论回复参数无效，回复须为 1–100 字" });
  const result = await writeMcDevData(
    "comments.reply",
    `/items/comment/pe/${encodeURIComponent(params.id)}/reply`,
    session,
    "PUT",
    JSON.stringify({ content: params.content.trim() }),
  );
  return result.ok ? ok(undefined) : result;
}

/** Use official type codes and compact dates; rating filtering stays in the renderer */
export async function listComments(session: NeteaseSession, params: CommentListParams): Promise<Result<CommentPage>> {
  if (!isCommentListParams(params))
    return fail({ kind: "business", code: "invalid_params", message: "评论查询参数无效" });
  const result = await getMcDevData(
    "comments.list",
    withQuery("/items/comment/pe/", {
      start: params.start,
      span: params.span,
      fuzzy_key: params.keyword,
      comment_tag: params.tag,
      start_date: params.startDate?.replaceAll("-", ""),
      end_date: params.endDate?.replaceAll("-", ""),
    }),
    session,
  );
  return result.ok ? readCommentPage(result.value) : result;
}
