import type { MessageType } from "@glaze/plugin-sdk";
import { messageLabels } from "../data";
import styles from "./MessageTypeBadge.module.css";

const toneClass: Record<MessageType, string | undefined> = {
  system_notice: styles.system,
  important_notice: styles.important,
  review_notice: styles.review,
  issue_feedback: styles.feedback,
  notify: styles.reminder,
};

/** Outlined badge whose color reflects the message type */
export function MessageTypeBadge({ type }: { type: string }) {
  const known = Object.hasOwn(messageLabels, type);
  return (
    <span className={`${styles.badge} ${known ? toneClass[type as MessageType] : styles.system}`}>
      {known ? messageLabels[type as MessageType] : type || "其他通知"}
    </span>
  );
}
