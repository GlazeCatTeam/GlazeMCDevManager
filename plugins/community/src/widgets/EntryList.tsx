import { EmptyState, Tag } from "@glaze/plugin-sdk";
import type { PlayerComment, PlayerFeedback } from "../mock";
import { CommentRating } from "./CommentRating";
import styles from "./EntryList.module.css";
import { ReplyStatus } from "./EntryMeta";
import { FeedbackBadge } from "./FeedbackBadge";

export interface EntryListProps {
  title: string;
  entries: (PlayerFeedback | PlayerComment)[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  showReplyStatus?: boolean;
}

/** Fixed-height list; omit reply badges when the data source does not report reply state */
export function EntryList({ title, entries, selectedId, onSelect, showReplyStatus = true }: EntryListProps) {
  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.heading}>
        <h2>{title}</h2>
        <span>{entries.length} 条</span>
      </div>
      {entries.length > 0 ? (
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
                  {"type" in entry ? <FeedbackBadge type={entry.type} /> : <CommentRating value={entry.stars} />}
                  <span className={styles.nickname}>{entry.nickname}</span>
                  {showReplyStatus && <ReplyStatus entry={entry} />}
                </span>
                <span className={styles.excerpt}>{entry.content}</span>
                <span className={styles.footer}>
                  <span className={styles.work}>{entry.work}</span>
                  <time>{entry.createdAt.slice(5)}</time>
                </span>
                {"tag" in entry && (
                  <span className={styles.tagRow}>
                    {entry.tag && <Tag>{entry.tag}</Tag>}
                    <span>UID: {entry.uid}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="没有符合条件的记录" hint="试试其他关键词或调整筛选条件" />
      )}
    </section>
  );
}
