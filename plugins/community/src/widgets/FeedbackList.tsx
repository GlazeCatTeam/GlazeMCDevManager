import { EmptyState, type PlayerFeedback } from "@glaze/plugin-sdk";
import styles from "./EntryList.module.css";
import { ReplyStatus } from "./EntryMeta";
import { FeedbackBadge } from "./FeedbackBadge";

/** Show the current page in a fixed-height scrollable feedback list */
export function FeedbackList({
  entries,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  entries: PlayerFeedback[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string;
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
          title={loading ? "正在加载反馈…" : error ? "反馈加载失败" : "没有符合条件的反馈"}
          hint={loading ? "请稍候" : error ? "点击重试以重新加载当前页" : "可调整筛选条件，或翻页查看其他反馈"}
        />
      )}
    </section>
  );
}
