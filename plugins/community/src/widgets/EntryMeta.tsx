import type { CommunityEntry } from "../mock";
import styles from "./EntryMeta.module.css";

/** "已回复" in green or "未回复" in amber */
export function ReplyStatus({ entry }: { entry: CommunityEntry }) {
  return entry.reply ? (
    <span className={`${styles.status} ${styles.replied}`}>已回复</span>
  ) : (
    <span className={`${styles.status} ${styles.pending}`}>未回复</span>
  );
}

/** Player UID, component and time under the detail heading */
export function EntryIdentity({ entry }: { entry: CommunityEntry }) {
  return (
    <div className={styles.identity}>
      <span>UID: {entry.uid}</span>
      <span>组件: {entry.work}</span>
      <time>{entry.createdAt}</time>
    </div>
  );
}

/** Existing developer reply beneath the player message */
export function DeveloperResponse({ entry }: { entry: CommunityEntry }) {
  if (!entry.reply) {
    return null;
  }
  return (
    <section className={styles.reply}>
      <div className={styles.replyHeading}>
        <strong>开发者回复</strong>
        <span>{entry.reply.createdAt}</span>
      </div>
      <p>{entry.reply.content}</p>
    </section>
  );
}
