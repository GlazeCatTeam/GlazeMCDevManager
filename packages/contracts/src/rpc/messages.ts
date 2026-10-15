import type { AccountParams } from "./developer";

export const messageTypes = ["system_notice", "important_notice", "review_notice", "issue_feedback", "notify"] as const;
export type MessageType = (typeof messageTypes)[number];

export interface MessageSummary {
  id: string;
  type: string;
  title: string;
  sentAt: string;
  read: boolean;
}

export interface MessageContent {
  text: string;
  sender: string;
  extra: string[];
}

export interface MessagePage {
  messages: MessageSummary[];
  total: number;
  unread: number | null;
  unreadByType: Record<MessageType, number | null>;
}

export interface MessageListParams extends AccountParams {
  start?: number;
  span?: number;
  title?: string;
  read?: boolean;
  type?: MessageType;
}

// Opening details also marks a message read, so every operation pins the current account
export interface MessageParams {
  account: string;
  id: string;
}

export interface MessageDeleteParams {
  account: string;
  ids: string[];
}

/** Permit opaque mailbox identifiers without allowing path or query injection */
export function isMessageId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

/** Validate the captured deletion set before sending any platform mutation */
export function isMessageIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 1000 &&
    value.every(isMessageId) &&
    new Set(value).size === value.length
  );
}

/** Validate optional list filters at the host boundary */
export function isMessageListParams(value: unknown): value is MessageListParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const params = value as Record<string, unknown>;
  return (
    (params.account === undefined || (typeof params.account === "string" && params.account.length > 0)) &&
    (params.start === undefined || (Number.isSafeInteger(params.start) && Number(params.start) >= 0)) &&
    (params.span === undefined ||
      (Number.isInteger(params.span) && Number(params.span) >= 1 && Number(params.span) <= 100)) &&
    (params.title === undefined || (typeof params.title === "string" && params.title.length <= 200)) &&
    (params.read === undefined || typeof params.read === "boolean") &&
    (params.type === undefined || messageTypes.includes(params.type as MessageType))
  );
}
