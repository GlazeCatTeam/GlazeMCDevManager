import {
  Button,
  Checkbox,
  Chip,
  type CommentListParams,
  type CommentTypeCode,
  commentTypes,
  EmptyState,
  PageHeader,
  Pagination,
  SearchField,
  Tag,
  TextButton,
  useSession,
} from "@glaze/plugin-sdk";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./CommunityPage.module.css";
import { CommentPageCache } from "./comment-cache";
import {
  COMMENTS_PER_PAGE,
  type CommentDateRange,
  commentDateRanges,
  commentDates,
  commentEntry,
} from "./comments-data";
import { useCommentReplies } from "./useCommentReplies";
import { useComments } from "./useComments";
import { CommentRating, DrumstickIcon } from "./widgets/CommentRating";
import { CommentReplyForm } from "./widgets/CommentReplyForm";
import detailStyles from "./widgets/EntryDetail.module.css";
import { EntryList } from "./widgets/EntryList";
import { DeveloperResponse, EntryIdentity } from "./widgets/EntryMeta";

const ratings = [5, 4, 3, 2, 1];
const MemoEntryList = memo(EntryList);

/** Reset filters and selected records whenever the current account changes */
export function CommentsPage() {
  const { current } = useSession();
  return current ? (
    <AccountComments key={current.id} account={current.id} />
  ) : (
    <div className={styles.page}>
      <PageHeader title="玩家评论" subtitle="查看网易平台的玩家评论" />
      <EmptyState title="请先登录账号" hint="登录开发者账号后即可查看玩家评论" />
    </div>
  );
}

/** Apply filters in place while keeping the result panels and loading feedback stable */
function AccountComments({ account }: { account: string }) {
  const [cache] = useState(() => new CommentPageCache());
  const replies = useCommentReplies(account);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<CommentDateRange>("全部");
  const [stars, setStars] = useState<number[]>([]);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [tag, setTag] = useState<CommentTypeCode | "">("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const params: CommentListParams = {
    account,
    start: page * COMMENTS_PER_PAGE,
    span: COMMENTS_PER_PAGE,
    ...commentDates(range),
    ...(keyword ? { keyword } : {}),
    ...(tag ? { tag } : {}),
  };
  const query = useComments(params, revision, cache, stars, hideEmpty);

  useEffect(() => {
    if (search.trim() === keyword) return;
    const timer = setTimeout(() => {
      setKeyword(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, keyword]);

  /** Refresh the current query without discarding the last successful page */
  const refresh = () => {
    cache.expire();
    setRevision((value) => value + 1);
  };

  /** Reply confirmation must not reuse a read started before the write */
  const refreshAfterReply = () => {
    cache.clear();
    setRevision((value) => value + 1);
  };

  /** Retry failed batches using successful source pages already loaded for this query */
  const retry = () => setRevision((value) => value + 1);

  /** Restore all filters together, including a pending debounced search */
  const resetFilters = () => {
    setSearch("");
    setKeyword("");
    setRange("全部");
    setStars([]);
    setHideEmpty(false);
    setTag("");
    setPage(0);
  };
  const hasFilters = Boolean(search || range !== "全部" || stars.length || hideEmpty || tag);

  return (
    <div className={`${styles.page} ${styles.commentsPage}`}>
      <PageHeader
        title="玩家评论"
        subtitle="查看玩家评价，按时间、评分和类型快速查找"
        actions={
          <Button className={styles.refreshButton} onClick={refresh} disabled={query.loading}>
            {query.loading ? "加载中…" : "刷新"}
          </Button>
        }
      />
      <section className={`${styles.filters} ${styles.commentFilters}`} aria-label="评论筛选">
        <div className={styles.filterRow}>
          <SearchField value={search} onChange={setSearch} placeholder="搜索昵称、内容、组件名…" />
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>时间</span>
            {commentDateRanges.map((value) => (
              <Chip
                key={value}
                selected={range === value}
                onClick={() => {
                  setRange(value);
                  setPage(0);
                }}
              >
                {value}
              </Chip>
            ))}
          </div>
        </div>
        <div className={styles.filterRow}>
          <fieldset className={styles.filterGroup} aria-label="评分，多选">
            <span className={styles.filterLabel}>评分</span>
            {ratings.map((value) => (
              <Chip
                key={value}
                selected={stars.includes(value)}
                onClick={() => {
                  setStars((current) =>
                    current.includes(value) ? current.filter((star) => star !== value) : [...current, value],
                  );
                  setPage(0);
                }}
              >
                {value}
                <DrumstickIcon />
              </Chip>
            ))}
            <span className={styles.filterNote}>可多选，未选时显示全部评分</span>
          </fieldset>
          <Checkbox
            checked={hideEmpty}
            onChange={(checked) => {
              setHideEmpty(checked);
              setPage(0);
            }}
          >
            屏蔽无文字评论
          </Checkbox>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>评论类型</span>
            <Chip
              selected={!tag}
              onClick={() => {
                setTag("");
                setPage(0);
              }}
            >
              全部
            </Chip>
            {commentTypes.map(({ code, label }) => (
              <Chip
                key={code}
                selected={tag === code}
                onClick={() => {
                  setTag(code);
                  setPage(0);
                }}
              >
                {label}
              </Chip>
            ))}
          </div>
          <TextButton onClick={resetFilters} disabled={!hasFilters}>
            重置筛选
          </TextButton>
        </div>
      </section>
      <CommentResults
        query={query}
        filtered={stars.length > 0 || hideEmpty}
        page={page}
        onPage={setPage}
        onRetry={retry}
        onReplySent={refreshAfterReply}
        replies={replies}
      />
    </div>
  );
}

interface CommentResultsProps {
  query: ReturnType<typeof useComments>;
  filtered: boolean;
  page: number;
  onPage: (page: number) => void;
  onRetry: () => void;
  onReplySent: () => void;
  replies: ReturnType<typeof useCommentReplies>;
}

/** Keep panel identity and scroll while replacing snapshots only when the query has usable results */
function CommentResults({ query, filtered, page, onPage, onRetry, onReplySent, replies }: CommentResultsProps) {
  const [selection, setSelection] = useState<{ key: string; id: string | undefined }>({
    key: query.dataKey,
    id: undefined,
  });
  const detail = useRef<HTMLDivElement>(null);
  const entries = useMemo(
    () =>
      (query.data?.items ?? []).map((item) => {
        const entry = commentEntry(item);
        const content = replies.confirmedReplies.get(entry.id);
        return content ? { ...entry, canReply: false, reply: entry.reply ?? { content, createdAt: "" } } : entry;
      }),
    [query.data, replies.confirmedReplies],
  );
  const visible = entries;
  const selected = visible.find((entry) => selection.key === query.dataKey && entry.id === selection.id) ?? visible[0];
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / COMMENTS_PER_PAGE));
  const displayedPage = Math.floor(JSON.parse(query.dataKey).start / COMMENTS_PER_PAGE);

  /** Keep selection within the displayed query while preserving it during same-query refreshes */
  const select = useCallback((id: string | undefined) => setSelection({ key: query.dataKey, id }), [query.dataKey]);

  useEffect(() => {
    if (query.data) select(selected?.id);
  }, [query.data, selected?.id, select]);

  useLayoutEffect(() => {
    if (selected?.id && detail.current) detail.current.scrollTop = 0;
  }, [selected?.id]);

  useEffect(() => {
    if (query.data && !query.loading && !query.isPreviousData && !query.error) {
      if (page >= pageCount) onPage(pageCount - 1);
    }
  }, [query.data, query.loading, query.isPreviousData, query.error, page, pageCount, onPage]);

  return (
    <section className={styles.results} aria-label="评论查询结果">
      <div className={styles.resultStatus}>
        <div className={styles.statusText} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles.statusSummary}>
            {query.isPreviousData
              ? query.loading
                ? "正在应用筛选 · 暂时保留上次结果"
                : "筛选未完成 · 当前显示上次结果"
              : query.loading
                ? "正在更新评论…"
                : query.error
                  ? query.data
                    ? "评论更新未完成"
                    : "评论加载失败"
                  : query.data
                    ? `${query.partial ? "已加载匹配" : filtered ? "筛选后共" : "共"} ${query.data.total} 条评论 · 当前页 ${entries.length} 条`
                    : "评论暂未加载"}
          </div>
          <div className={styles.statusHint}>
            {query.loading
              ? query.progress
                ? `已检查 ${query.progress.scanned} / ${query.progress.total} 条评论，已找到 ${query.progress.matched} 条匹配 · ${query.partial ? "继续加载中…" : "继续加载中，当前显示上次结果…"}`
                : query.data
                  ? "正在更新评论，当前显示上次加载结果…"
                  : filtered
                    ? "正在查找匹配评论，结果会陆续显示…"
                    : "正在加载评论…"
              : query.isPreviousData
                ? "调整筛选条件后重试，可继续查看上次结果"
                : query.error
                  ? query.partial
                    ? `已加载匹配 ${query.data?.total ?? 0} 条评论 · 当前页 ${entries.length} 条`
                    : query.data
                      ? "上次结果已保留，可重试更新"
                      : "请检查网络后重试"
                  : "选择左侧评论查看详情和回复"}
          </div>
        </div>
        {query.error && (
          <div className={styles.queryError} role="alert">
            <span>
              评论加载失败：{query.error.message || "请稍后重试"}
              {query.data ? (query.partial && !query.isPreviousData ? "；已保留部分结果" : "；已保留上次结果") : ""}
            </span>
            <TextButton tone="warning" onClick={onRetry}>
              重试
            </TextButton>
          </div>
        )}
        {query.loading && (
          <progress
            className={styles.scanProgress}
            aria-label="评论加载进度"
            max={query.progress?.total || 1}
            value={query.progress ? query.progress.scanned : undefined}
          />
        )}
      </div>
      <div className={styles.columns} aria-busy={query.loading}>
        <MemoEntryList
          title="评论列表"
          entries={visible}
          selectedId={selected?.id}
          onSelect={select}
          showReplyStatus={false}
          resetKey={query.dataKey}
          emptyTitle={query.loading ? "正在查找匹配评论…" : query.error ? "评论加载失败" : "没有符合条件的评论"}
          emptyHint={
            query.loading
              ? "可继续调整筛选，匹配结果会陆续显示"
              : query.error
                ? "点击重试，或调整筛选条件"
                : "试试其他关键词，或重置筛选查看全部评论"
          }
        />
        <section className={detailStyles.panel} aria-label="评论详情">
          {selected ? (
            <>
              <div className={detailStyles.content} ref={detail}>
                <div className={styles.detailHeading}>
                  <h2>{selected.nickname}</h2>
                  {selected.tag && <Tag>{selected.tag}</Tag>}
                  <span className={styles.detailRating}>
                    <CommentRating value={selected.stars} />
                  </span>
                </div>
                <EntryIdentity entry={selected} />
                <p className={styles.body}>{selected.content || "（该评论没有文字内容）"}</p>
                <DeveloperResponse entry={selected} title="当前账号的回复" />
              </div>
              <CommentReplyForm
                entry={selected}
                draft={replies.draftOf(selected.id)}
                status={replies.statusOf(selected.id)}
                sending={replies.sending}
                pending={query.isPreviousData}
                onChange={(content) => replies.setDraft(selected.id, content)}
                onSend={() => {
                  void replies.sendReply(selected, onReplySent);
                }}
              />
            </>
          ) : (
            <EmptyState title={query.loading ? "正在加载评论…" : "暂无详情"} hint="选择左侧评论查看内容和回复" />
          )}
        </section>
      </div>
      <fieldset
        className={styles.resultPagination}
        disabled={query.isPreviousData || !query.data}
        aria-label="评论翻页"
      >
        <Pagination
          page={displayedPage}
          pageCount={pageCount}
          onChange={onPage}
          note={query.partial ? "仅显示已加载结果" : "每页 20 条"}
        />
        {pageCount === 1 && (
          <span className={styles.singlePage}>
            {query.data && !query.isPreviousData
              ? `${query.partial ? "已加载" : "共"} ${query.data.total} 条 · 每页 20 条`
              : "每页 20 条"}
          </span>
        )}
      </fieldset>
    </section>
  );
}
