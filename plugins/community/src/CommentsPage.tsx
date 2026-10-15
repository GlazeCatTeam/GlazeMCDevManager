import { Tag } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./CommunityPage.module.css";
import {
  CommentRating,
  CommunityHeader,
  CommunityList,
  CommunitySearch,
  DeveloperResponse,
  DrumstickIcon,
  EmptyDetail,
  EntryIdentity,
  FilterChip,
  ReplyEditor,
} from "./components";
import {
  commentTags,
  type DateRange,
  dateRanges,
  filterComments,
  comments as initialComments,
  mockToday,
  replyToEntry,
} from "./mock";

/** Player comments with date, multi-rating and component-tag filtering */
export function CommentsPage() {
  const [entries, setEntries] = useState(initialComments);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("全部");
  const [stars, setStars] = useState<number[]>([]);
  const [tag, setTag] = useState("全部");
  const [selectedId, setSelectedId] = useState(initialComments[0]?.id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const visible = filterComments(entries, search, range, stars, tag);
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const unreplied = entries.filter((entry) => !entry.reply).length;

  /** Toggle individual ratings; no selection includes all ratings */
  const toggleStar = (value: number) =>
    setStars((current) => (current.includes(value) ? current.filter((star) => star !== value) : [...current, value]));

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
        title="玩家评论"
        summary={`共 ${entries.length} 条评论 · 未回复 ${unreplied}`}
        status={status}
        onRefresh={refresh}
      />
      <section className={styles.filters} aria-label="评论筛选">
        <div className={styles.filterRow}>
          <CommunitySearch value={search} onChange={setSearch} />
          <div className={styles.filterGroup} title={`模拟日期: ${mockToday}`}>
            <span className={styles.filterLabel}>时间</span>
            {dateRanges.map((value) => (
              <FilterChip key={value} active={range === value} onClick={() => setRange(value)}>
                {value}
              </FilterChip>
            ))}
          </div>
        </div>
        <div className={styles.filterRow}>
          <fieldset className={`${styles.filterGroup} ${styles.ratingFilter}`} aria-label="评分，多选，不选则显示全部">
            <span className={styles.filterLabel}>评分</span>
            {[5, 4, 3, 2, 1].map((value) => (
              <FilterChip key={value} active={stars.includes(value)} onClick={() => toggleStar(value)}>
                {value}
                <DrumstickIcon />
              </FilterChip>
            ))}
            <span className={styles.filterNote}>可多选</span>
          </fieldset>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>组件标签</span>
            {["全部", ...commentTags].map((value) => (
              <FilterChip key={value} active={tag === value} onClick={() => setTag(value)}>
                {value}
              </FilterChip>
            ))}
          </div>
        </div>
      </section>
      <div className={styles.columns}>
        <CommunityList title="评论列表" entries={visible} selectedId={selected?.id} onSelect={setSelectedId} />
        <section className={styles.detail} aria-label="评论详情">
          {selected ? (
            <>
              <div className={styles.detailContent}>
                <div className={styles.detailHeading}>
                  <h2>{selected.nickname}</h2>
                  <Tag>{selected.tag}</Tag>
                  <span className={styles.detailRating}>
                    <CommentRating value={selected.stars} />
                  </span>
                </div>
                <EntryIdentity entry={selected} />
                <p className={styles.body}>{selected.content}</p>
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
    </div>
  );
}
