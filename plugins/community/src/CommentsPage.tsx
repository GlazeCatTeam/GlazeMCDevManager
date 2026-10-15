import {
  Button,
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
import { useEffect, useState } from "react";
import styles from "./CommunityPage.module.css";
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

/** Keep server filters separate from the current page's local rating filter */
function AccountComments({ account }: { account: string }) {
  const replies = useCommentReplies(account);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<CommentDateRange>("全部");
  const [stars, setStars] = useState<number[]>([]);
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

  useEffect(() => {
    if (search.trim() === keyword) return;
    const timer = setTimeout(() => {
      setKeyword(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, keyword]);

  /** Refresh the current query without discarding the last successful page */
  const refresh = () => setRevision((value) => value + 1);

  return (
    <div className={styles.page}>
      <PageHeader
        title="玩家评论"
        subtitle="网易平台评论 · 每页 20 条"
        actions={<Button onClick={refresh}>刷新</Button>}
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
          <fieldset className={styles.filterGroup} aria-label="评分，多选，仅筛选当前页">
            <span className={styles.filterLabel}>评分</span>
            {ratings.map((value) => (
              <Chip
                key={value}
                selected={stars.includes(value)}
                onClick={() =>
                  setStars((current) =>
                    current.includes(value) ? current.filter((star) => star !== value) : [...current, value],
                  )
                }
              >
                {value}
                <DrumstickIcon />
              </Chip>
            ))}
            <span className={styles.filterNote}>可多选 · 仅筛选当前页</span>
          </fieldset>
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
        key={JSON.stringify(params)}
        params={params}
        stars={stars}
        page={page}
        onPage={setPage}
        revision={revision}
        onRefresh={refresh}
        replies={replies}
      />
    </div>
  );
}

interface CommentResultsProps {
  params: CommentListParams;
  stars: number[];
  page: number;
  onPage: (page: number) => void;
  revision: number;
  onRefresh: () => void;
  replies: ReturnType<typeof useCommentReplies>;
}

/** A query-keyed panel prevents previous filters or accounts from leaking into a new result */
function CommentResults({ params, stars, page, onPage, revision, onRefresh, replies }: CommentResultsProps) {
  const query = useComments(params, revision);
  const [selectedId, setSelectedId] = useState<string>();
  const entries = (query.data?.items ?? []).map((item) => {
    const entry = commentEntry(item);
    const content = replies.replyOf(entry.id);
    return content ? { ...entry, canReply: false, reply: entry.reply ?? { content, createdAt: "" } } : entry;
  });
  const visible = entries.filter((entry) => stars.length === 0 || stars.includes(entry.stars));
  const selected = visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / COMMENTS_PER_PAGE));

  useEffect(() => {
    if (query.data) {
      if (page >= pageCount) onPage(pageCount - 1);
    }
  }, [query.data, page, pageCount, onPage]);

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
          {query.data ? "；当前显示上次成功加载的结果" : ""}
        </Notice>
      )}
      <div role="status">
        {query.loading
          ? "正在加载评论…"
          : query.data
            ? `共 ${query.data.total} 条评论 · 当前页 ${entries.length} 条 · 筛选后 ${visible.length} 条`
            : "评论暂未加载"}
      </div>
      <div className={styles.columns} aria-busy={query.loading}>
        {!query.data && (query.loading || query.error) ? (
          <section className={detailStyles.panel} aria-label="评论列表">
            <EmptyState
              title={query.loading ? "正在加载评论…" : "评论加载失败"}
              hint={query.loading ? "请稍候" : "点击重试，或调整评论类型和日期"}
            />
          </section>
        ) : (
          <EntryList
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
                <DeveloperResponse entry={selected} />
              </div>
              <CommentReplyForm
                entry={selected}
                draft={replies.draftOf(selected.id)}
                status={replies.statusOf(selected.id)}
                sending={replies.sending}
                onChange={(content) => replies.setDraft(selected.id, content)}
                onSend={() => {
                  void replies.sendReply(selected, onRefresh);
                }}
              />
            </>
          ) : (
            <EmptyState title="暂无详情" hint="调整筛选或翻页后，选择左侧评论查看详情" />
          )}
        </section>
      </div>
      <Pagination page={page} pageCount={pageCount} onChange={onPage} note="每页 20 条 · 评分仅筛选当前页" />
    </>
  );
}
