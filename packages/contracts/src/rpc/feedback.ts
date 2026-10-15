import type { AccountParams } from "./developer";

export const feedbackTypeLabels = {
  "0": "故障问题",
  "1": "玩法建议",
  "2": "内容侵权",
  "3": "其他",
  "4": "组件冲突",
  "5": "我的山头",
  "6": "性能反馈",
} as const;
export type FeedbackTypeCode = keyof typeof feedbackTypeLabels;
export type FeedbackType = (typeof feedbackTypeLabels)[FeedbackTypeCode] | "未知类型";
export const MAX_FEEDBACK_REPLY_LENGTH = 500;

export interface PlayerFeedback {
  id: string;
  nickname: string;
  uid: string;
  work: string;
  content: string;
  createdAt: string;
  canReply: boolean;
  reply?: { content: string; createdAt: string };
  blockedReason?: string;
  type: FeedbackType;
  images: { name: string; url: string }[];
  log?: { name: string; url: string };
  conflicts: string[];
}

export interface FeedbackListParams extends AccountParams {
  start: number;
  span: number;
  type?: FeedbackTypeCode;
  search?: string;
}

export interface FeedbackPageData {
  entries: PlayerFeedback[];
  total: number;
}

export interface FeedbackReplyParams {
  account: string;
  id: string;
  content: string;
}

/** Validate a list query before it reaches the platform */
export function isFeedbackListParams(value: unknown): value is FeedbackListParams {
  if (!value || typeof value !== "object") return false;
  const params = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(params.start) &&
    Number(params.start) >= 0 &&
    Number.isInteger(params.span) &&
    Number(params.span) >= 1 &&
    Number(params.span) <= 100 &&
    (params.account === undefined || (typeof params.account === "string" && params.account.length > 0)) &&
    (params.type === undefined ||
      (typeof params.type === "string" && Object.hasOwn(feedbackTypeLabels, params.type))) &&
    (params.search === undefined || (typeof params.search === "string" && params.search.length <= 200))
  );
}

/** Feedback identifiers are opaque but must never contain path separators */
export function isFeedbackReplyParams(value: unknown): value is FeedbackReplyParams {
  if (!value || typeof value !== "object") return false;
  const params = value as Record<string, unknown>;
  return (
    typeof params.account === "string" &&
    params.account.length > 0 &&
    typeof params.id === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(params.id) &&
    typeof params.content === "string" &&
    params.content.trim().length > 0 &&
    params.content.length <= MAX_FEEDBACK_REPLY_LENGTH
  );
}
