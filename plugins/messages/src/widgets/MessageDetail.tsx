import { EmptyState, TextButton } from "@glaze/plugin-sdk";
import type { Message } from "../mock";
import styles from "./MessageDetail.module.css";
import { MessageTypeBadge } from "./MessageTypeBadge";

export interface MessageDetailProps {
  message: Message | undefined;
  onDelete: (id: string) => void;
}

/** Fixed-height message detail: scrolling body with the delete action pinned at the bottom */
export function MessageDetail({ message, onDelete }: MessageDetailProps) {
  if (!message) {
    return (
      <section className={styles.panel} aria-label="消息详情">
        <EmptyState title="暂无详情" hint="选择一条消息查看详情" />
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="消息详情">
      <div className={styles.content}>
        <div className={styles.meta}>
          <MessageTypeBadge type={message.type} />
          <time>{message.sentAt}</time>
        </div>
        <h2 className={styles.title}>{message.title}</h2>
        <span className={styles.muted}>发送方：{message.sender}</span>
        <div className={styles.body}>
          {message.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {message.info.length > 0 && (
          <dl className={styles.info}>
            {message.info.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className={styles.footer}>
        <span className={styles.muted}>打开消息即标记为已读</span>
        <TextButton tone="danger" onClick={() => onDelete(message.id)}>
          删除该消息
        </TextButton>
      </div>
    </section>
  );
}
