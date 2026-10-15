import type { MessageType } from "../mock";
import styles from "./MessageTypeBadge.module.css";

const toneClass: Record<MessageType, string | undefined> = {
  系统通知: styles.system,
  重要通知: styles.important,
  审核通知: styles.review,
  问题反馈: styles.feedback,
  提醒: styles.reminder,
};

/** Outlined badge whose color reflects the message type */
export function MessageTypeBadge({ type }: { type: MessageType }) {
  return <span className={`${styles.badge} ${toneClass[type]}`}>{type}</span>;
}
