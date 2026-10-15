import { Button, EmptyState, type MessageSummary } from "@glaze/plugin-sdk";
import styles from "./MessageList.module.css";
import { MessageTypeBadge } from "./MessageTypeBadge";

export interface MessageListProps {
  messages: MessageSummary[];
  selectedId: string | undefined;
  onOpen: (id: string) => void;
  loading: boolean;
  failed: boolean;
  disabled: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

/** Fixed-height message list; unread titles are bold with a green dot */
export function MessageList({
  messages,
  selectedId,
  onOpen,
  loading,
  failed,
  disabled,
  hasMore,
  onLoadMore,
}: MessageListProps) {
  return (
    <section className={styles.panel} aria-label="消息列表">
      <div className={styles.heading}>
        <strong>消息列表</strong>
        <span>{loading ? "加载中…" : `已加载 ${messages.length} 条`}</span>
      </div>
      {messages.length > 0 ? (
        <div className={styles.list}>
          {messages.map((message) => (
            <button
              type="button"
              disabled={disabled}
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
          {hasMore && (
            <Button disabled={disabled} onClick={onLoadMore}>
              加载更多
            </Button>
          )}
        </div>
      ) : (
        <EmptyState
          title={loading ? "正在加载消息…" : failed ? "消息加载失败" : "没有符合条件的消息"}
          hint={loading ? "请稍候" : failed ? "请重试或检查登录状态" : "试试其他关键词或调整筛选条件"}
        />
      )}
    </section>
  );
}
