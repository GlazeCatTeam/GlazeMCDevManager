import { Button, Chip, PageHeader, SearchField, Tag } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./CommunityPage.module.css";
import {
  commentTags,
  type DateRange,
  dateRanges,
  filterComments,
  comments as initialComments,
  mockToday,
} from "./mock";
import { useReplies } from "./useReplies";
import { CommentRating, DrumstickIcon } from "./widgets/CommentRating";
import { EntryDetail } from "./widgets/EntryDetail";
import { EntryList } from "./widgets/EntryList";
import { DeveloperResponse, EntryIdentity } from "./widgets/EntryMeta";

const ratings = [5, 4, 3, 2, 1];

/** Player comments filtered by date, rating (multiple choice) and component tag */
export function CommentsPage() {
  const { entries, unreplied, status, refresh, draftOf, setDraft, sendReply } = useReplies(initialComments);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("全部");
  const [stars, setStars] = useState<number[]>([]);
  const [tag, setTag] = useState("全部");
  const [selectedId, setSelectedId] = useState(initialComments[0]?.id);
  const visible = filterComments(entries, search, range, stars, tag);
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];

  /** Toggle one rating; an empty selection shows every rating */
  const toggleStar = (value: number) =>
    setStars((current) => (current.includes(value) ? current.filter((star) => star !== value) : [...current, value]));

  return (
    <div className={styles.page}>
      <PageHeader
        title="玩家评论"
        subtitle={<span role="status">{status || `共 ${entries.length} 条评论 · 未回复 ${unreplied}`} · 模拟数据</span>}
        actions={<Button onClick={refresh}>刷新</Button>}
      />
      <section className={styles.filters} aria-label="评论筛选">
        <div className={styles.filterRow}>
          <SearchField value={search} onChange={setSearch} placeholder="搜索昵称、内容、组件名…" />
          <div className={styles.filterGroup} title={`模拟日期: ${mockToday}`}>
            <span className={styles.filterLabel}>时间</span>
            {dateRanges.map((value) => (
              <Chip key={value} selected={range === value} onClick={() => setRange(value)}>
                {value}
              </Chip>
            ))}
          </div>
        </div>
        <div className={styles.filterRow}>
          <fieldset className={styles.filterGroup} aria-label="评分，多选，不选则显示全部">
            <span className={styles.filterLabel}>评分</span>
            {ratings.map((value) => (
              <Chip key={value} selected={stars.includes(value)} onClick={() => toggleStar(value)}>
                {value}
                <DrumstickIcon />
              </Chip>
            ))}
            <span className={styles.filterNote}>可多选</span>
          </fieldset>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>组件标签</span>
            {["全部", ...commentTags].map((value) => (
              <Chip key={value} selected={tag === value} onClick={() => setTag(value)}>
                {value}
              </Chip>
            ))}
          </div>
        </div>
      </section>
      <div className={styles.columns}>
        <EntryList title="评论列表" entries={visible} selectedId={selected?.id} onSelect={setSelectedId} />
        <EntryDetail
          label="评论详情"
          entry={selected}
          draft={selected ? draftOf(selected.id) : ""}
          onDraftChange={(value) => selected && setDraft(selected.id, value)}
          onSend={() => selected && sendReply(selected)}
        >
          {selected && (
            <>
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
            </>
          )}
        </EntryDetail>
      </div>
    </div>
  );
}
