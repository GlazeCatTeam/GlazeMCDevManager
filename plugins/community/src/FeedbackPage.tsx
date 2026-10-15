import { Button, Dialog, Tag, TextButton } from "@glaze/plugin-sdk";
import { useCallback, useState } from "react";
import styles from "./CommunityPage.module.css";
import {
  CommunityHeader,
  CommunityList,
  CommunitySearch,
  DeveloperResponse,
  EmptyDetail,
  EntryIdentity,
  FeedbackBadge,
  FilterChip,
  ReplyEditor,
} from "./components";
import {
  type FeedbackImage,
  type FeedbackType,
  feedbackTypes,
  filterFeedback,
  feedback as initialFeedback,
  type ReplyFilter,
  replyToEntry,
} from "./mock";

/** Geometric demo attachment matching the artwork blocks in the supplied design */
function AttachmentArtwork({ image }: { image: FeedbackImage }) {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label={`${image.name}，模拟附件`}>
      <title>{image.name}</title>
      <rect width="160" height="100" fill="var(--g-surface-app)" />
      <path d="M0 0h130L30 100H0z" fill={image.color} />
    </svg>
  );
}

/** Player feedback with filters, attachments and isolated local reply drafts */
export function FeedbackPage() {
  const [entries, setEntries] = useState(initialFeedback);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<FeedbackType | "全部">("全部");
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>("全部");
  const [selectedId, setSelectedId] = useState(initialFeedback[0]?.id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<
    { kind: "image"; image: FeedbackImage } | { kind: "log"; name: string; content: string } | null
  >(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const visible = filterFeedback(entries, search, type, replyFilter);
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const unreplied = entries.filter((entry) => !entry.reply).length;

  /** Refresh the current local dataset while preserving demo replies */
  const refresh = () => {
    setEntries((current) => [...current]);
    setStatus("已刷新本地模拟数据");
  };

  /** Save only the selected record's reply and clear its own draft */
  const sendReply = () => {
    if (!selected) return;
    const content = drafts[selected.id] ?? "";
    if (!selected.canReply || selected.reply || !content.trim()) return;
    setEntries((current) => replyToEntry(current, selected.id, content));
    setDrafts((current) => ({ ...current, [selected.id]: "" }));
    setStatus(`已为 ${selected.nickname} 记录本地模拟回复`);
  };

  return (
    <div className={styles.page}>
      <CommunityHeader
        title="玩家反馈"
        summary={`共 ${entries.length} 条反馈 · 未回复 ${unreplied}`}
        status={status}
        onRefresh={refresh}
      />
      <section className={styles.filters} aria-label="反馈筛选">
        <div className={styles.filterRow}>
          <CommunitySearch value={search} onChange={setSearch} />
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>回复状态</span>
            {(["全部", "未回复", "已回复"] as const).map((value) => (
              <FilterChip key={value} active={replyFilter === value} onClick={() => setReplyFilter(value)}>
                {value}
              </FilterChip>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>类型</span>
          {(["全部", ...feedbackTypes] as const).map((value) => (
            <FilterChip key={value} active={type === value} onClick={() => setType(value)}>
              {value}
            </FilterChip>
          ))}
        </div>
      </section>
      <div className={styles.columns}>
        <CommunityList title="反馈列表" entries={visible} selectedId={selected?.id} onSelect={setSelectedId} />
        <section className={styles.detail} aria-label="反馈详情">
          {selected ? (
            <>
              <div className={styles.detailContent}>
                <div className={styles.detailHeading}>
                  <FeedbackBadge type={selected.type} />
                  <h2>{selected.nickname}</h2>
                  <span className={selected.reply ? styles.replied : styles.pending}>
                    {selected.reply ? "已回复" : "未回复"}
                  </span>
                </div>
                <EntryIdentity entry={selected} />
                <p className={styles.body}>{selected.content}</p>
                {selected.images.length > 0 && (
                  <section className={styles.attachments}>
                    <h3>
                      附件图片 <span>({selected.images.length})</span>
                    </h3>
                    <div className={styles.imageList}>
                      {selected.images.map((image) => (
                        <button
                          key={image.name}
                          type="button"
                          className={styles.thumbnail}
                          aria-label={`查看${image.name}`}
                          onClick={() => setPreview({ kind: "image", image })}
                        >
                          <AttachmentArtwork image={image} />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {selected.log && (
                  <div className={styles.logFile}>
                    <strong>日志文件</strong>
                    <span>{selected.log.name}</span>
                    <TextButton onClick={() => selected.log && setPreview({ kind: "log", ...selected.log })}>
                      查看
                    </TextButton>
                  </div>
                )}
                {selected.conflicts.length > 0 && (
                  <section className={styles.attachments}>
                    <h3>冲突模组</h3>
                    <div className={styles.filterGroup}>
                      {selected.conflicts.map((conflict) => (
                        <Tag key={conflict} tone="warning">
                          {conflict}
                        </Tag>
                      ))}
                    </div>
                  </section>
                )}
                <DeveloperResponse entry={selected} />
              </div>
              <ReplyEditor
                entry={selected}
                draft={drafts[selected.id] ?? ""}
                onDraftChange={(value) => setDrafts((current) => ({ ...current, [selected.id]: value }))}
                onSend={sendReply}
              />
            </>
          ) : (
            <EmptyDetail />
          )}
        </section>
      </div>
      {preview && (
        <Dialog
          title={preview.kind === "image" ? preview.image.name : preview.name}
          onClose={closePreview}
          actions={<Button onClick={closePreview}>关闭</Button>}
        >
          {preview.kind === "image" ? (
            <div className={styles.imagePreview}>
              <AttachmentArtwork image={preview.image} />
              <span>模拟附件预览</span>
            </div>
          ) : (
            <pre className={styles.logPreview}>{preview.content}</pre>
          )}
        </Dialog>
      )}
    </div>
  );
}
