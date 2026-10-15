import {
  type FeedbackListParams,
  type FeedbackPageData,
  type FeedbackReplyParams,
  type FeedbackTypeCode,
  feedbackTypeLabels,
  isFeedbackListParams,
  isFeedbackReplyParams,
  type PlayerFeedback,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery, writeMcDevData } from "../http/client";
import { isNeteaseImageUrl } from "../http/hosts";
import { readNumber, readRecord, readString } from "../http/parse";

const endpoint = "feedback.pe";
const MAX_LOG_BYTES = 1024 * 1024;

/** Format Unix timestamps in Beijing time without inventing a reply time */
function feedbackTime(value: unknown): string | null {
  const timestamp = readNumber(value);
  if (timestamp === null || timestamp < 0) return null;
  const date = new Date((timestamp < 1e12 ? timestamp * 1000 : timestamp) + 8 * 3600000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace("T", " ");
}

/** Apply the existing CDN policy without credentials or custom ports */
export function isFeedbackAttachmentUrl(value: unknown): value is string {
  if (typeof value !== "string" || !isNeteaseImageUrl(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password && !url.port;
}

/** Decode structured conflict details while keeping unknown content readable */
function conflictDetails(content: string): { content: string; conflicts: string[] } {
  try {
    const value = readRecord(JSON.parse(content));
    if (!Array.isArray(value.item_list)) return { content, conflicts: [] };
    const conflicts = value.item_list
      .map((item) => readString(readRecord(item).name))
      .filter((name): name is string => name !== null);
    return { content: readString(value.detail) ?? content, conflicts: [...new Set(conflicts)] };
  } catch {
    return { content, conflicts: [] };
  }
}

/** Normalize a page; malformed required data is an error, never an empty success */
export function readFeedbackPage(value: unknown): Result<FeedbackPageData> {
  const raw = readRecord(value);
  const total = readNumber(raw.count);
  if (!Array.isArray(raw.data) || total === null || !Number.isSafeInteger(total) || total < 0)
    return fail({ kind: "parse", endpoint });
  const entries: PlayerFeedback[] = [];
  const ids = new Set<string>();
  for (const value of raw.data) {
    const row = readRecord(value);
    const id = readString(row._id);
    const createdAt = feedbackTime(row.create_time);
    if (
      !id ||
      ids.has(id) ||
      !createdAt ||
      typeof row.content !== "string" ||
      (row.reply != null && typeof row.reply !== "string") ||
      (row.forbid_reply != null && typeof row.forbid_reply !== "boolean") ||
      (row.pic_list != null && !Array.isArray(row.pic_list))
    )
      return fail({ kind: "parse", endpoint });
    ids.add(id);
    const code = readString(row.type) ?? "";
    const reply = readString(row.reply);
    const logUrl = readString(row.feedback_log_file);
    const details = code === "4" ? conflictDetails(row.content) : { content: row.content, conflicts: [] };
    entries.push({
      id,
      nickname: readString(row.commit_nickname) ?? "未知玩家",
      uid: readString(row.commit_uid) ?? "—",
      work: readString(row.res_name) ?? "未知组件",
      ...details,
      createdAt,
      type: Object.hasOwn(feedbackTypeLabels, code) ? feedbackTypeLabels[code as FeedbackTypeCode] : "未知类型",
      canReply: row.forbid_reply !== true && reply === null,
      ...(row.forbid_reply === true ? { blockedReason: "平台已禁止回复此条反馈" } : {}),
      ...(reply ? { reply: { content: reply, createdAt: "" } } : {}),
      images: (Array.isArray(row.pic_list) ? row.pic_list : [])
        .filter(isFeedbackAttachmentUrl)
        .map((url, index) => ({ name: `附件图片 ${index + 1}`, url })),
      ...(logUrl && isFeedbackAttachmentUrl(logUrl) ? { log: { name: "反馈日志", url: logUrl } } : {}),
    });
  }
  return ok({ entries, total });
}

/** Read a bounded page using the platform's keyword and category filters */
export async function listFeedback(
  session: NeteaseSession,
  params: FeedbackListParams,
): Promise<Result<FeedbackPageData>> {
  if (!isFeedbackListParams(params)) return fail({ kind: "business", code: "validation", message: "反馈查询参数无效" });
  const result = await getMcDevData(
    endpoint,
    withQuery("/items/feedback/pe/", {
      start: params.start,
      span: params.span,
      type: params.type,
      fuzzy_key: params.search?.trim() || undefined,
    }),
    session,
  );
  return result.ok ? readFeedbackPage(result.value) : result;
}

/** Send one explicit reply without automatically retrying failed writes */
export async function replyFeedback(session: NeteaseSession, params: FeedbackReplyParams): Promise<Result<undefined>> {
  if (!isFeedbackReplyParams(params))
    return fail({ kind: "business", code: "validation", message: "反馈回复参数无效" });
  const result = await writeMcDevData(
    "feedback.reply",
    `/items/feedback/pe/${encodeURIComponent(params.id)}/reply`,
    session,
    "PUT",
    JSON.stringify({ content: params.content.trim() }),
  );
  return result.ok ? ok(undefined) : result;
}

/** Preview a bounded UTF-8 log without sending account cookies to the attachment server */
export async function readFeedbackLog(url: string): Promise<Result<string>> {
  if (!isFeedbackAttachmentUrl(url)) return fail({ kind: "business", code: "validation", message: "日志地址不受支持" });
  try {
    const response = await fetch(url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body)
      return fail({ kind: "business", code: String(response.status), message: "日志加载失败" });
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_LOG_BYTES) {
        await reader.cancel();
        return fail({ kind: "business", code: "too_large", message: "日志超过 1 MiB，无法预览" });
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0") || text.startsWith("PK\u0003\u0004"))
      return fail({ kind: "business", code: "binary", message: "此日志为压缩包或二进制文件，暂不支持文本预览" });
    return ok(text);
  } catch {
    return fail({ kind: "business", code: "log_unavailable", message: "日志无法预览，请检查网络及文件格式后重试" });
  }
}
