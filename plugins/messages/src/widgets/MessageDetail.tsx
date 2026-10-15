import { Button, EmptyState, type MessageContent, type MessageSummary, TextButton } from "@glaze/plugin-sdk";
import { messageText } from "../data";
import styles from "./MessageDetail.module.css";
import { MessageTypeBadge } from "./MessageTypeBadge";

export interface MessageDetailProps {
  message: MessageSummary | undefined;
  content: MessageContent | undefined;
  loading: boolean;
  error: string;
  disabled: boolean;
  onRetry: () => void;
  onDelete: (id: string) => void;
}

/** Render platform content as inert text and keep errors distinct from an empty detail */
export function MessageDetail({ message, content, loading, error, disabled, onRetry, onDelete }: MessageDetailProps) {
  if (!message)
    return (
      <section className={styles.panel} aria-label="消息详情">
        <EmptyState title="暂无详情" hint="选择一条消息查看详情" />
      </section>
    );
  return (
    <section className={styles.panel} aria-label="消息详情">
      <div className={styles.content}>
        <div className={styles.meta}>
          <MessageTypeBadge type={message.type} />
          <time>{message.sentAt}</time>
        </div>
        <h2 className={styles.title}>{message.title}</h2>
        {loading && <p role="status">正在加载详情…</p>}
        {error && (
          <div role="alert">
            {error}{" "}
            <Button disabled={disabled} onClick={onRetry}>
              重试
            </Button>
          </div>
        )}
        {content && (
          <>
            <span className={styles.muted}>发送方：{content.sender || "未提供"}</span>
            <div className={styles.body}>{messageText(content.text) || "暂无正文"}</div>
            {content.extra.length > 0 && (
              <dl className={styles.info}>
                <div>
                  <dt>附加信息</dt>
                  <dd>{content.extra.map(messageText).join("\n\n")}</dd>
                </div>
              </dl>
            )}
          </>
        )}
      </div>
      <div className={styles.footer}>
        <span className={styles.muted}>打开消息即标记为已读</span>
        <TextButton disabled={disabled} tone="danger" onClick={() => onDelete(message.id)}>
          删除该消息
        </TextButton>
      </div>
    </section>
  );
}
