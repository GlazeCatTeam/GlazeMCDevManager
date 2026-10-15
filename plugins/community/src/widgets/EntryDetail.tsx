import { EmptyState } from "@glaze/plugin-sdk";
import type { ReactNode } from "react";
import type { CommunityEntry } from "../mock";
import styles from "./EntryDetail.module.css";
import { ReplyEditor } from "./ReplyEditor";

export interface EntryDetailProps {
  label: string;
  entry: CommunityEntry | undefined;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  /** Page-specific content of the selected entry */
  children: ReactNode;
}

/** Fixed-height detail panel: scrolling content with the reply box pinned at the bottom */
export function EntryDetail({ label, entry, draft, onDraftChange, onSend, children }: EntryDetailProps) {
  return (
    <section className={styles.panel} aria-label={label}>
      {entry ? (
        <>
          <div className={styles.content}>{children}</div>
          <ReplyEditor entry={entry} draft={draft} onDraftChange={onDraftChange} onSend={onSend} />
        </>
      ) : (
        <EmptyState title="暂无详情" hint="调整筛选后，选择左侧记录查看详情" />
      )}
    </section>
  );
}
