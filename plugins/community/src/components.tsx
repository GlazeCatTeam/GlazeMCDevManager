import { Button, Tag } from "@glaze/plugin-sdk";
import type { ReactNode } from "react";
import styles from "./CommunityPage.module.css";
import type { CommunityEntry, FeedbackType, PlayerComment, PlayerFeedback } from "./mock";

/** Shared page heading with an explicit demo-data marker */
export function CommunityHeader({
  title,
  summary,
  status,
  onRefresh,
}: {
  title: string;
  summary: string;
  status: string;
  onRefresh: () => void;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.subtitle} role="status">
          {status || summary} · 模拟数据
        </span>
      </div>
      <Button onClick={onRefresh}>刷新</Button>
    </div>
  );
}

/** Compact filter button matching the existing leaderboard chips */
export function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Search box with a visible search affordance and an accessible name */
export function CommunitySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.search}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M2 2h8v8H2zM10 10h2v2h2v2h-2v-2h-2z" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <input
        type="search"
        aria-label="搜索昵称、内容或组件名"
        placeholder="搜索昵称、内容、组件名…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** Small outlined badge whose color reflects the feedback category */
export function FeedbackBadge({ type }: { type: FeedbackType }) {
  const tone =
    type === "故障问题" || type === "内容侵权"
      ? styles.danger
      : type === "组件冲突"
        ? styles.warning
        : type === "玩法建议" || type === "我的山头"
          ? styles.success
          : styles.muted;
  return <span className={`${styles.typeBadge} ${tone}`}>{type}</span>;
}

/** Render the supplied Hunger.svg artwork with a muted state for unearned points */
export function DrumstickIcon({ empty = false }: { empty?: boolean }) {
  return (
    <svg
      className={styles.drumstick}
      viewBox="0 0 9 9"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <path
        d="M2 0v1H1v1H0v2h1v1h1v1h1v1h3v2h2V8h1V6H7V3H6V2H5V1H4V0z"
        fill={empty ? "var(--g-text-placeholder)" : "#000"}
      />
      <path fill={empty ? "var(--g-surface-sunken)" : "#b88458"} d="M6 4V3H5V2H3v2z" />
      <path fill={empty ? "var(--g-surface-sunken)" : "#613c1b"} d="M2 4v1h1v1h1V4z" />
      <path fill={empty ? "var(--g-surface-sunken)" : "#e2d5aa"} d="M6 6h1v1H6z" />
      <path fill={empty ? "var(--g-surface-sunken)" : "#fff7dc"} d="M7 7h1v1H7z" />
      <path fill={empty ? "var(--g-surface-sunken)" : "#d42a2a"} d="M1 4h2V3h1V1H2v1H1z" />
      <path fill={empty ? "var(--g-surface-sunken)" : "#7b512d"} d="M3 4v1h1v1h2V4z" />
      <path fill={empty ? "var(--g-surface-sunken)" : "#b21818"} d="M1 3h1v1H1zm2-2h1v1H3z" />
      <path fill={empty ? "var(--g-surface-sunken)" : "#9d6d43"} d="M4 5h2V4H5V3H4z" />
      <path fill={empty ? "var(--g-surface-sunken)" : "#dfb18f"} d="M2 2h1v1H2z" />
    </svg>
  );
}

/** Five drumsticks with a textual rating for screen readers */
export function CommentRating({ value }: { value: number }) {
  return (
    <span className={styles.rating} role="img" aria-label={`${value} 分, 满分 5 分`}>
      {[1, 2, 3, 4, 5].map((score) => (
        <DrumstickIcon key={score} empty={score > value} />
      ))}
    </span>
  );
}

/** Fixed-height selectable feedback or comment list */
export function CommunityList({
  title,
  entries,
  selectedId,
  onSelect,
}: {
  title: string;
  entries: (PlayerFeedback | PlayerComment)[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <section className={styles.listPanel} aria-label={title}>
      <div className={styles.listHeading}>
        <h2>{title}</h2>
        <span>{entries.length} 条</span>
      </div>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={entry.id === selectedId ? `${styles.entry} ${styles.entryActive}` : styles.entry}
              aria-pressed={entry.id === selectedId}
              onClick={() => onSelect(entry.id)}
            >
              <span className={styles.entryHeading}>
                {"type" in entry ? <FeedbackBadge type={entry.type} /> : <CommentRating value={entry.stars} />}
                <span className={styles.nickname}>{entry.nickname}</span>
                <span className={entry.reply ? styles.replied : styles.pending}>
                  {entry.reply ? "已回复" : "未回复"}
                </span>
              </span>
              <span className={styles.excerpt}>{entry.content}</span>
              <span className={styles.entryFooter}>
                <span className={styles.work}>{entry.work}</span>
                <time>{entry.createdAt.slice(5)}</time>
              </span>
              {"tag" in entry && (
                <span className={styles.listTag}>
                  <Tag>{entry.tag}</Tag>
                  <span>UID: {entry.uid}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {entries.length === 0 && (
        <div className={styles.empty}>
          <strong>没有符合条件的记录</strong>
          <span>试试其他关键词或调整筛选条件</span>
        </div>
      )}
    </section>
  );
}

/** Consistent player and component identity in the selected detail */
export function EntryIdentity({ entry }: { entry: CommunityEntry }) {
  return (
    <div className={styles.identity}>
      <span>UID: {entry.uid}</span>
      <span>组件: {entry.work}</span>
      <time>{entry.createdAt}</time>
    </div>
  );
}

/** Existing developer reply appears beneath the player message */
export function DeveloperResponse({ entry }: { entry: CommunityEntry }) {
  if (!entry.reply) return null;
  return (
    <section className={styles.developerReply}>
      <div className={styles.replyHeading}>
        <strong>开发者回复</strong>
        <span>{entry.reply.createdAt}</span>
      </div>
      <p>{entry.reply.content}</p>
    </section>
  );
}

/** Bottom-aligned local demo reply form with a bounded draft */
export function ReplyEditor({
  entry,
  draft,
  onDraftChange,
  onSend,
}: {
  entry: CommunityEntry;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}) {
  if (!entry.canReply || entry.reply) {
    return (
      <div className={styles.replyDisabled}>
        {entry.reply ? "已回复此条记录" : entry.blockedReason || "该记录暂不支持回复"}
        <span>本地模拟数据，不会发送到平台</span>
      </div>
    );
  }
  return (
    <form
      className={styles.replyForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim()) onSend();
      }}
    >
      <div className={styles.replyInputRow}>
        <textarea
          aria-label={`回复${entry.nickname}`}
          placeholder="回复这条消息…"
          value={draft}
          maxLength={500}
          rows={2}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <Button variant="primary" size="sm" type="submit" disabled={!draft.trim()}>
          发送
        </Button>
      </div>
      <div className={styles.replyHint}>
        <span>本地演示 · 回复不会发送到平台</span>
        <span>{draft.length} / 500</span>
      </div>
    </form>
  );
}

/** Detail placeholder when filters leave no selected record */
export function EmptyDetail() {
  return (
    <div className={styles.empty}>
      <strong>暂无详情</strong>
      <span>调整筛选后，选择左侧记录查看详情</span>
    </div>
  );
}
