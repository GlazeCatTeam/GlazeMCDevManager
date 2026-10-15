import type { AccountParams } from "./developer";

/** The official comment filters use codes, while list rows contain Chinese labels */
export const commentTypes = [
  { code: "0", label: "默认类型" },
  { code: "10", label: "问题求助" },
  { code: "20", label: "模组评测" },
  { code: "30", label: "玩法攻略" },
  { code: "40", label: "建议反馈" },
  { code: "50", label: "其他讨论" },
  { code: "60", label: "组件冲突" },
] as const;

export type CommentTypeCode = (typeof commentTypes)[number]["code"];
export const MAX_COMMENT_REPLY_LENGTH = 100;

export interface CommentReplyParams {
  account: string;
  id: string;
  content: string;
}

/** Require an explicit account, a safe opaque comment id and a bounded reply */
export function isCommentReplyParams(value: unknown): value is CommentReplyParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const params = value as Record<string, unknown>;
  return (
    typeof params.account === "string" &&
    params.account.trim().length > 0 &&
    typeof params.id === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(params.id) &&
    typeof params.content === "string" &&
    params.content.trim().length > 0 &&
    params.content.length <= MAX_COMMENT_REPLY_LENGTH
  );
}

export interface CommentListParams extends AccountParams {
  start: number;
  span: number;
  keyword?: string;
  tag?: CommentTypeCode;
  startDate?: string;
  endDate?: string;
}

export interface PlayerComment {
  id: string;
  resourceId: string;
  nickname: string;
  uid: string;
  work: string;
  content: string;
  tag: string;
  stars: number;
  /** Unix timestamp in seconds */
  publishTime: number;
  canReply: boolean;
  reply?: { content: string; createdAt: string };
}

export interface CommentPage {
  total: number;
  items: PlayerComment[];
}

/** Reject invalid calendar dates instead of accepting date overflow */
function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

/** Validate pagination and optional filters at the host boundary */
export function isCommentListParams(value: unknown): value is CommentListParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const params = value as CommentListParams;
  return (
    Number.isSafeInteger(params.start) &&
    params.start >= 0 &&
    params.start <= 2_147_483_647 &&
    Number.isInteger(params.span) &&
    params.span >= 1 &&
    params.span <= 100 &&
    (params.account === undefined || (typeof params.account === "string" && params.account.length > 0)) &&
    [params.keyword].every(
      (text) => text === undefined || (typeof text === "string" && text.trim().length > 0 && text.length <= 500),
    ) &&
    (params.tag === undefined || commentTypes.some((type) => type.code === params.tag)) &&
    ((params.startDate === undefined && params.endDate === undefined) ||
      (isDate(params.startDate) && isDate(params.endDate) && params.startDate <= params.endDate))
  );
}
