import { EmptyState } from "@glaze/plugin-sdk";
import type { Message } from "../mock";
import styles from "./MessageList.module.css";
import { MessageTypeBadge } from "./MessageTypeBadge";

export interface MessageListProps {
  messages: Message[];
  selectedId: string | undefined;
  onOpen: (id: string) => void;
}

/** Fixed-height message list; unread titles are bold with a green dot */
export function MessageList({ messages, selectedId, onOpen }: MessageListProps) {
  return (
    <section className={styles.panel} aria-label="消息列表">
      <div className={styles.heading}>
        <strong>消息列表</strong>
        <span>{messages.length} 条</span>
      </div>
      {messages.length > 0 ? (
        <div className={styles.list}>
          {messages.map((message) => (
            <button
              type="button"
              key={message.id}
              className={message.id === selectedId ? `${styles.item} ${styles.selected}` : styles.item}
              aria-pressed={message.id === selectedId}
              onClick={() => onOpen(message.id)}
            >
              <span className={message.read ? styles.title : `${styles.title} ${styles.unread}`}>
                <span className={message.read ? styles.readDot : styles.unreadDot} />
                {message.title}
              </span>
              <span className={styles.meta}>
                <MessageTypeBadge type={message.type} />
                <time>{message.sentAt}</time>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="没有符合条件的消息" hint="试试其他关键词或调整筛选条件" />
      )}
    </section>
  );
}
