import {
  Button,
  Chip,
  EmptyState,
  type FeedbackTypeCode,
  feedbackTypeLabels,
  PageHeader,
  Pagination,
  SearchField,
  useSession,
} from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import styles from "./CommunityPage.module.css";
import { FEEDBACK_PER_PAGE, useFeedback } from "./useFeedback";
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

/** Reset pagination on filter changes and display feedback filtered across the complete query */
function AccountFeedback({ account }: { account: string }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<FeedbackTypeCode | "全部">("全部");
  const [replyFilter, setReplyFilter] = useState<(typeof replyFilters)[number]>("全部");
  const [selectedId, setSelectedId] = useState<string>();
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
      setSelectedId(undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, query]);
  const feedback = useFeedback(account, type, query, page, replyFilter);
  const pageCount = Math.max(1, Math.ceil(feedback.total / FEEDBACK_PER_PAGE));
  useEffect(() => {
    if (!feedback.loading && !feedback.error && page >= pageCount) {
      setPage(pageCount - 1);
      setSelectedId(undefined);
    }
  }, [feedback.loading, feedback.error, page, pageCount]);

  /** Start each selected page at its first feedback while preserving per-record drafts */
  const changePage = (value: number) => {
    setPage(value);
    setSelectedId(undefined);
  };

  /** Query a new category from its first page */
  const changeType = (value: FeedbackTypeCode | "全部") => {
    setType(value);
    changePage(0);
  };
  const visible = feedback.entries;
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const unreplied = feedback.entries.filter((entry) => !entry.reply).length;

  return (
    <div className={styles.page}>
      <PageHeader
        title="玩家反馈"
        subtitle={`${replyFilter === "全部" ? "共" : "筛选后共"} ${feedback.total} 条 · 当前页 ${feedback.entries.length} 条 · 当前页未回复 ${unreplied}`}
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
              <Chip
                key={value}
                selected={replyFilter === value}
                onClick={() => {
                  setReplyFilter(value);
                  changePage(0);
                }}
              >
                {value}
              </Chip>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>类型</span>
          <Chip selected={type === "全部"} onClick={() => changeType("全部")}>
            全部
          </Chip>
          {(Object.keys(feedbackTypeLabels) as FeedbackTypeCode[]).map((value) => (
            <Chip key={value} selected={type === value} onClick={() => changeType(value)}>
              {feedbackTypeLabels[value]}
            </Chip>
          ))}
        </div>
        <span className={styles.filterNote}>回复状态筛选全部反馈后分页 · 时间为北京时间</span>
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
      {feedback.loading && replyFilter !== "全部" && <p role="status">正在加载全部反馈并筛选回复状态…</p>}
      <div className={styles.columns}>
        <FeedbackList
          key={JSON.stringify([type, query, replyFilter, page])}
          entries={visible}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          loading={feedback.loading}
          error={feedback.error}
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
      <Pagination page={page} pageCount={pageCount} onChange={changePage} note="每页 20 条 · 按筛选结果分页" />
    </div>
  );
}
