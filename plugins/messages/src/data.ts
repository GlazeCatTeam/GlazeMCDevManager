import type { MessageType } from "@glaze/plugin-sdk";

export const messageLabels: Record<MessageType, string> = {
  system_notice: "系统通知",
  important_notice: "重要通知",
  review_notice: "审核通知",
  issue_feedback: "问题反馈",
  notify: "提醒",
};

/** Keep message markup inert while preserving paragraph breaks and common text entities */
export function messageText(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
