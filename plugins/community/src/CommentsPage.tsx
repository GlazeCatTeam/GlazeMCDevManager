import {
  Button,
  Checkbox,
  Chip,
  type CommentListParams,
  type CommentTypeCode,
  commentTypes,
  EmptyState,
  Notice,
  PageHeader,
  Pagination,
  SearchField,
  Tag,
  TextButton,
  useSession,
} from "@glaze/plugin-sdk";
import { memo, useEffect, useMemo, useState } from "react";
import styles from "./CommunityPage.module.css";
import { CommentPageCache } from "./comment-cache";
import { commentQueryKey } from "./comment-query";
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

/** Reset pagination when filters change and show matching comments as batches arrive */
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

  return (
    <div className={styles.page}>
      <PageHeader
        title="玩家评论"
        subtitle="网易平台评论 · 每页 20 条"
        actions={
          <Button onClick={refresh} disabled={query.loading}>
            {query.loading ? "刷新中…" : "刷新"}
          </Button>
        }
      />
      <section className={styles.filters} aria-label="评论筛选">
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
            <span className={styles.filterNote}>可多选 · 分批加载，筛选后分页</span>
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
        </div>
      </section>
      <CommentResults
        key={commentQueryKey(params, stars, hideEmpty)}
        query={query}
        filtered={stars.length > 0 || hideEmpty}
        page={page}
        onPage={setPage}
        onRefresh={refresh}
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
  onRefresh: () => void;
  onReplySent: () => void;
  replies: ReturnType<typeof useCommentReplies>;
}

/** Display already filtered pages without leaking results across queries or accounts */
function CommentResults({ query, filtered, page, onPage, onRefresh, onReplySent, replies }: CommentResultsProps) {
  const [selectedId, setSelectedId] = useState<string>();
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
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / COMMENTS_PER_PAGE));

  useEffect(() => {
    if (query.data && !query.loading) {
      if (page >= pageCount) onPage(pageCount - 1);
    }
  }, [query.data, query.loading, page, pageCount, onPage]);

  return (
    <>
      {query.error && (
        <Notice
          action={
            <TextButton tone="warning" onClick={onRefresh}>
              重试
            </TextButton>
          }
        >
          评论加载失败：{query.error.message}
          {query.data
            ? query.partial
              ? "；已保留加载到的部分结果，重试可继续更新"
              : "；当前显示上次成功加载的结果"
            : ""}
        </Notice>
      )}
      <div role="status">
        {query.loading
          ? query.progress
            ? `已检查 ${query.progress.scanned} / ${query.progress.total} 条评论，已找到 ${query.progress.matched} 条匹配 · ${query.partial ? "继续加载中…" : "继续加载中，当前显示上次结果…"}`
            : query.data
              ? "正在更新评论，当前显示上次加载结果…"
              : filtered
                ? "正在分批加载并筛选评论，匹配结果会陆续显示…"
                : "正在加载评论…"
          : query.data
            ? `${query.partial ? "已加载匹配" : filtered ? "筛选后共" : "共"} ${query.data.total} 条评论 · 当前页 ${entries.length} 条`
            : "评论暂未加载"}
      </div>
      <div className={styles.columns} aria-busy={query.loading}>
        {(!query.data || !entries.length) && (query.loading || query.error) ? (
          <section className={detailStyles.panel} aria-label="评论列表">
            <EmptyState
              title={query.loading ? "正在查找匹配评论…" : "评论加载失败"}
              hint={query.loading ? "匹配结果会陆续显示，可随时调整筛选条件" : "点击重试，或调整评论类型和日期"}
            />
          </section>
        ) : (
          <MemoEntryList
            title="评论列表"
            entries={visible}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            showReplyStatus={false}
          />
        )}
        <section className={detailStyles.panel} aria-label="评论详情">
          {selected ? (
            <>
              <div className={detailStyles.content}>
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
                onChange={(content) => replies.setDraft(selected.id, content)}
                onSend={() => {
                  void replies.sendReply(selected, onReplySent);
                }}
              />
            </>
          ) : (
            <EmptyState title="暂无详情" hint="调整筛选或翻页后，选择左侧评论查看详情" />
          )}
        </section>
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        onChange={onPage}
        note={query.partial ? "每页 20 条 · 仅显示已加载结果" : "每页 20 条 · 按筛选结果分页"}
      />
    </>
  );
}
