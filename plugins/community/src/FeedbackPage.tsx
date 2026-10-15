import { Button, Chip, PageHeader, SearchField } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./CommunityPage.module.css";
import {
  type FeedbackType,
  feedbackTypes,
  filterFeedback,
  feedback as initialFeedback,
  type ReplyFilter,
} from "./mock";
import { useReplies } from "./useReplies";
import { EntryDetail } from "./widgets/EntryDetail";
import { EntryList } from "./widgets/EntryList";
import { DeveloperResponse, EntryIdentity, ReplyStatus } from "./widgets/EntryMeta";
import { FeedbackAttachments } from "./widgets/FeedbackAttachments";
import { FeedbackBadge } from "./widgets/FeedbackBadge";

const replyFilters: ReplyFilter[] = ["全部", "未回复", "已回复"];

/** Player feedback: filters on top, list on the left, detail with attachments and reply on the right */
export function FeedbackPage() {
  const { entries, unreplied, status, refresh, draftOf, setDraft, sendReply } = useReplies(initialFeedback);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<FeedbackType | "全部">("全部");
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>("全部");
  const [selectedId, setSelectedId] = useState(initialFeedback[0]?.id);
  const visible = filterFeedback(entries, search, type, replyFilter);
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];

  return (
    <div className={styles.page}>
      <PageHeader
        title="玩家反馈"
        subtitle={<span role="status">{status || `共 ${entries.length} 条反馈 · 未回复 ${unreplied}`} · 模拟数据</span>}
        actions={<Button onClick={refresh}>刷新</Button>}
      />
      <section className={styles.filters} aria-label="反馈筛选">
        <div className={styles.filterRow}>
          <SearchField value={search} onChange={setSearch} placeholder="搜索昵称、内容、组件名…" />
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>回复状态</span>
            {replyFilters.map((value) => (
              <Chip key={value} selected={replyFilter === value} onClick={() => setReplyFilter(value)}>
                {value}
              </Chip>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>类型</span>
          {(["全部", ...feedbackTypes] as const).map((value) => (
            <Chip key={value} selected={type === value} onClick={() => setType(value)}>
              {value}
            </Chip>
          ))}
        </div>
      </section>
      <div className={styles.columns}>
        <EntryList title="反馈列表" entries={visible} selectedId={selected?.id} onSelect={setSelectedId} />
        <EntryDetail
          label="反馈详情"
          entry={selected}
          draft={selected ? draftOf(selected.id) : ""}
          onDraftChange={(value) => selected && setDraft(selected.id, value)}
          onSend={() => selected && sendReply(selected)}
        >
          {selected && (
            <>
              <div className={styles.detailHeading}>
                <FeedbackBadge type={selected.type} />
                <h2>{selected.nickname}</h2>
                <ReplyStatus entry={selected} />
              </div>
              <EntryIdentity entry={selected} />
              <p className={styles.body}>{selected.content}</p>
              <FeedbackAttachments key={selected.id} feedback={selected} />
              <DeveloperResponse entry={selected} />
            </>
          )}
        </EntryDetail>
      </div>
    </div>
  );
}
