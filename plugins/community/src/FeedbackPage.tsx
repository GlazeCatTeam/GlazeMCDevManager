import {
  Button,
  Chip,
  EmptyState,
  type FeedbackTypeCode,
  feedbackTypeLabels,
  PageHeader,
  SearchField,
  useSession,
} from "@glaze/plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import styles from "./CommunityPage.module.css";
import { useFeedback } from "./useFeedback";
import { FeedbackDetail } from "./widgets/FeedbackDetail";
import { FeedbackList } from "./widgets/FeedbackList";

const replyFilters = ["全部", "未回复", "已回复"] as const;

/** Remount state when accounts change so feedback and drafts cannot cross accounts */
export function FeedbackPage() {
  const { current } = useSession();
  return current ? (
    <AccountFeedback key={current.id} account={current.id} />
  ) : (
    <EmptyState title="请先登录开发者账号" hint="登录后查看玩家反馈" />
  );
}

/** Keep loaded feedback visible during refresh and memoize local reply filtering */
function AccountFeedback({ account }: { account: string }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<FeedbackTypeCode | "全部">("全部");
  const [replyFilter, setReplyFilter] = useState<(typeof replyFilters)[number]>("全部");
  const [selectedId, setSelectedId] = useState<string>();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const feedback = useFeedback(account, type, query);
  const visible = useMemo(
    () =>
      feedback.entries.filter((entry) => replyFilter === "全部" || Boolean(entry.reply) === (replyFilter === "已回复")),
    [feedback.entries, replyFilter],
  );
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const unreplied = feedback.entries.filter((entry) => !entry.reply).length;

  return (
    <div className={styles.page}>
      <PageHeader
        title="玩家反馈"
        subtitle={`共 ${feedback.total} 条 · 已加载 ${feedback.entries.length} 条 · 已加载未回复 ${unreplied}`}
        actions={
          <Button onClick={feedback.refresh} disabled={feedback.loading}>
            {feedback.loading ? "更新中…" : "刷新"}
          </Button>
        }
      />
      <section className={styles.filters} aria-label="反馈筛选">
        <div className={styles.filterRow}>
          <SearchField
            value={search}
            onChange={(value) => setSearch(value.slice(0, 200))}
            placeholder="搜索昵称、内容、组件名…"
          />
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
          <Chip selected={type === "全部"} onClick={() => setType("全部")}>
            全部
          </Chip>
          {(Object.keys(feedbackTypeLabels) as FeedbackTypeCode[]).map((value) => (
            <Chip key={value} selected={type === value} onClick={() => setType(value)}>
              {feedbackTypeLabels[value]}
            </Chip>
          ))}
        </div>
        <span className={styles.filterNote}>回复状态仅筛选已加载反馈 · 时间为北京时间</span>
      </section>
      {feedback.error && (
        <div role="alert">
          加载失败：{feedback.error}
          {feedback.entries.length > 0 ? "；当前显示上次成功加载的内容" : ""}{" "}
          <Button onClick={feedback.retry} disabled={feedback.loading}>
            重试
          </Button>
        </div>
      )}
      {feedback.status && <p role="status">{feedback.status}</p>}
      <div className={styles.columns}>
        <FeedbackList
          entries={visible}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          loading={feedback.loading}
          hasMore={feedback.hasMore}
          onLoadMore={feedback.loadMore}
        />
        <FeedbackDetail
          entry={selected}
          draft={selected ? feedback.draftOf(selected.id) : ""}
          onDraftChange={(value) => selected && feedback.setDraft(selected.id, value)}
          onSend={() => {
            if (selected) void feedback.sendReply(selected);
          }}
          sending={feedback.sending !== null}
        />
      </div>
    </div>
  );
}
