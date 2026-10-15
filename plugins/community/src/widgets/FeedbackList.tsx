import { Button, EmptyState, type PlayerFeedback } from "@glaze/plugin-sdk";
import styles from "./EntryList.module.css";
import { ReplyStatus } from "./EntryMeta";
import { FeedbackBadge } from "./FeedbackBadge";

/** Scrollable feedback rows with the load-more action fixed beneath the list */
export function FeedbackList({
  entries,
  selectedId,
  onSelect,
  loading,
  hasMore,
  onLoadMore,
}: {
  entries: PlayerFeedback[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section className={styles.panel} aria-label="反馈列表" aria-busy={loading}>
      <div className={styles.heading}>
        <h2>反馈列表</h2>
        <span>{entries.length} 条</span>
      </div>
      {entries.length ? (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={entry.id === selectedId ? `${styles.entry} ${styles.active}` : styles.entry}
                aria-pressed={entry.id === selectedId}
                onClick={() => onSelect(entry.id)}
              >
                <span className={styles.entryHeading}>
                  <FeedbackBadge type={entry.type} />
                  <span className={styles.nickname}>{entry.nickname}</span>
                  <ReplyStatus entry={entry} />
                </span>
                <span className={styles.excerpt}>{entry.content}</span>
                <span className={styles.footer}>
                  <span className={styles.work}>{entry.work}</span>
                  <time>{entry.createdAt.slice(5)}</time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={loading ? "正在加载反馈…" : "没有符合条件的反馈"}
          hint={loading ? "请稍候" : "可调整筛选条件，或继续加载更多反馈"}
        />
      )}
      {hasMore && (
        <div className={styles.loadMore}>
          <Button size="sm" disabled={loading} onClick={onLoadMore}>
            {loading ? "正在加载…" : "加载更多反馈"}
          </Button>
        </div>
      )}
    </section>
  );
}
