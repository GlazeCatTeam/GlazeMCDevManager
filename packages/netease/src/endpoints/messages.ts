import {
  isMessageId,
  isMessageIds,
  isMessageListParams,
  type MessageContent,
  type MessageListParams,
  type MessagePage,
  type MessageSummary,
  type MessageType,
  messageTypes,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery, writeMcDevData } from "../http/client";
import { readArray, readNumber, readRecord, readString } from "../http/parse";

/** A platform count must be a nonnegative safe integer; absence stays unknown */
function count(value: unknown): number | null {
  const number = readNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

/** Parse mailbox rows and aggregates without replacing malformed lists with empty success */
export function readMessagePage(value: unknown): Result<MessagePage> {
  const raw = readRecord(value);
  const rows = readArray(raw.mail);
  const total = count(raw.count);
  if (!rows || total === null) return fail({ kind: "parse", endpoint: "messages.list" });
  const messages: MessageSummary[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const id = readString(row._id);
    if (
      !isMessageId(id) ||
      ids.has(id) ||
      typeof row.have_read !== "boolean" ||
      typeof row.title !== "string" ||
      typeof row.time !== "string" ||
      typeof row.mail_type !== "string"
    )
      return fail({ kind: "parse", endpoint: "messages.list" });
    ids.add(id);
    messages.push({ id, type: row.mail_type, title: row.title, sentAt: row.time, read: row.have_read });
  }
  const counts = readRecord(raw.unread_mail_counts);
  const unreadByType = Object.fromEntries(messageTypes.map((type) => [type, count(counts[type])])) as Record<
    MessageType,
    number | null
  >;
  return ok({ messages, total, unread: count(raw.unread_count), unreadByType });
}

/** Request one filtered page and fresh aggregates from the developer mailbox */
export async function listMessages(session: NeteaseSession, params: MessageListParams): Promise<Result<MessagePage>> {
  if (!isMessageListParams(params)) return fail({ kind: "business", code: "validation", message: "消息筛选参数无效" });
  const result = await getMcDevData(
    "messages.list",
    withQuery("/mailbox", {
      start: params.start ?? 0,
      span: params.span ?? 20,
      initLoad: true,
      title: params.title?.trim() || undefined,
      have_read: params.read,
      mail_type: params.type,
    }),
    session,
  );
  return result.ok ? readMessagePage(result.value) : result;
}

/** Read the account-wide unread count independently of list filters */
export async function getMessageUnreadCount(session: NeteaseSession): Promise<Result<number>> {
  const result = await getMcDevData("messages.unreadCount", "/mailbox/unread/count", session);
  if (!result.ok) return result;
  const unread = count(readRecord(result.value).count);
  return unread === null ? fail({ kind: "parse", endpoint: "messages.unreadCount" }) : ok(unread);
}

/** Fetch detail; the platform marks this message read as part of the GET */
export async function getMessage(session: NeteaseSession, id: string): Promise<Result<MessageContent>> {
  if (!isMessageId(id)) return fail({ kind: "business", code: "validation", message: "消息 ID 无效" });
  const result = await getMcDevData("messages.get", `/mailbox/${encodeURIComponent(id)}`, session);
  if (!result.ok) return result;
  const raw = readRecord(result.value);
  const extra = raw.extra_list ?? [];
  if (
    typeof raw.detail !== "string" ||
    (raw.sender !== undefined && typeof raw.sender !== "string") ||
    !Array.isArray(extra) ||
    !extra.every((item) => typeof item === "string")
  )
    return fail({ kind: "parse", endpoint: "messages.get" });
  return ok({ text: raw.detail, sender: typeof raw.sender === "string" ? raw.sender : "", extra });
}

/** Mark every message read with explicit DTO defaults and the required trailing slash */
export async function markAllMessagesRead(session: NeteaseSession): Promise<Result<undefined>> {
  const result = await writeMcDevData(
    "messages.markAllRead",
    "/mailbox/read_mail/",
    session,
    "POST",
    JSON.stringify({ mail_id_list: [], read_all: true }),
  );
  return result.ok ? ok(undefined) : result;
}

/** Delete only the identifiers captured by the UI confirmation, without automatic retries */
export async function deleteMessages(session: NeteaseSession, ids: string[]): Promise<Result<undefined>> {
  if (!isMessageIds(ids)) return fail({ kind: "business", code: "validation", message: "待删除的消息列表无效" });
  const result = await writeMcDevData(
    "messages.delete",
    "/mailbox/delete_many/",
    session,
    "POST",
    JSON.stringify({ mail_id_list: ids }),
  );
  return result.ok ? ok(undefined) : result;
}
