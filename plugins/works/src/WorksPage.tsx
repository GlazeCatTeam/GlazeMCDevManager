import {
  type AccountSummary,
  Button,
  Icon,
  Notice,
  PageHeader,
  Pagination,
  TextButton,
  useNavigation,
  useSession,
  type WorkStatus,
  type WorkSummary,
} from "@glaze/plugin-sdk";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorRoute } from "./EditorRoute";
import { loadWorkEditor } from "./editor-loader";
import type { WorkAction } from "./status";
import {
  invalidateWorks,
  preloadNextWorksPage,
  preloadWorkEditor,
  preloadWorkOptions,
  useWorksPage,
} from "./useWorkQuery";
import { rememberWorkListPosition, selectWorkListView, type WorkListView, workListPosition } from "./view-state";
import styles from "./WorksPage.module.css";
import { ReviewFeedbackDialog } from "./widgets/ReviewFeedbackDialog";
import { type ListWriteAction, WorkActionDialog } from "./widgets/WorkActionDialog";
import { WorkTile } from "./widgets/WorkTile";

const PER_PAGE = 9;
const McpDraftPage = lazy(() => import("./McpDraftPage").then((module) => ({ default: module.McpDraftPage })));
const LOADING_SLOTS = Array.from({ length: PER_PAGE }, (_, position) => `loading-${position}`);

/** One-line summary under the title */
function summary(list: WorkSummary[], total: number): string {
  if (total === 0) {
    return "还没有作品";
  }
  const count = (status: WorkStatus) => list.filter((w) => w.status === status).length;
  return `共 ${total} 个作品 · 本页已上架 ${count("online")} · 审核中 ${count("reviewing")} · 未通过 ${count("reject")}`;
}

/** Works management: the account's works as fixed-size tiles, nine per page, like MCDevManager's 上架管理 */
export function WorksPage() {
  const { current: account } = useSession();
  const { params } = useNavigation();
  if (params.mcpDraft)
    return (
      <Suspense fallback={<Notice>正在加载 AI 草稿…</Notice>}>
        <McpDraftPage key={params.mcpDraft} id={params.mcpDraft} />
      </Suspense>
    );
  return account ? <WorksForAccount key={account.id} account={account} /> : <Notice>请先登录账号。</Notice>;
}

/** Account changes remount pagination and selection before any old rows can be painted */
function WorksForAccount({ account }: { account: AccountSummary }) {
  const [page, setPage] = useState(() => workListPosition(account.id).page);
  const works = useWorksPage(account.id, page, PER_PAGE);
  const [lastView, setLastView] = useState<WorkListView | null>(null);
  const [slowLoad, setSlowLoad] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useRef<HTMLElement | null>(null);
  const [coverRevision, setCoverRevision] = useState(0);
  const [feedbackFor, setFeedbackFor] = useState<WorkSummary | null>(null);
  const [actionFor, setActionFor] = useState<{ work: WorkSummary; action: ListWriteAction } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const closeAction = useCallback(() => setActionFor(null), []);
  const [viewing, setViewing] = useState<{ work: WorkSummary; account: string } | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [createdFor, setCreatedFor] = useState<string | null>(null);
  const closeFeedback = useCallback(() => setFeedbackFor(null), []);
  const closeView = useCallback(() => setViewing(null), []);
  const closeCreate = useCallback(() => setCreatingFor(null), []);

  /** Intent-driven preparation shares its request with the eventual detail page */
  const prepare = useCallback(
    (work: WorkSummary) => {
      void loadWorkEditor().catch(() => {});
      void preloadWorkEditor(account.id, work.itemId);
    },
    [account.id],
  );

  /** Start data and code together instead of waiting for the editor chunk to mount */
  const openDetail = (work: WorkSummary) => {
    prepare(work);
    setPage(displayedPage);
    setViewing({ work, account: account.id });
  };

  /** New works need the same editor code and platform dictionaries */
  const prepareCreate = () => {
    void loadWorkEditor().catch(() => {});
    void preloadWorkOptions(account.id);
  };

  const shown = selectWorkListView(page, works.data, lastView);
  const displayedPage = shown?.page ?? page;
  const list = shown?.data.items ?? [];
  const pageCount = Math.max(1, Math.ceil((shown?.data.total ?? 0) / PER_PAGE));
  const showingEditor = !!viewing || !!creatingFor;

  useEffect(() => {
    if (!works.data) return;
    const total = works.data.total;
    if (total === 0 || page < Math.ceil(total / PER_PAGE)) setLastView({ page, data: works.data });
    setPage((old) => Math.min(old, Math.max(0, Math.ceil(total / PER_PAGE) - 1)));
  }, [works.data, page]);

  useEffect(() => {
    // Restart the subtle indicator when the user changes target during an outstanding read.
    void page;
    setSlowLoad(false);
    if (!works.loading) return;
    const timer = setTimeout(() => setSlowLoad(true), 300);
    return () => clearTimeout(timer);
  }, [works.loading, page]);

  useEffect(() => {
    if (!works.data || works.loading || works.error || showingEditor || account.status !== "active") return;
    const total = works.data.total;
    let cancelled = false;
    let idle: number | undefined;
    const prepareNext = () => {
      void preloadNextWorksPage(account.id, page, PER_PAGE, total, () => cancelled);
    };
    const timer = setTimeout(() => {
      if (typeof window.requestIdleCallback === "function")
        idle = window.requestIdleCallback(prepareNext, { timeout: 1000 });
      else prepareNext();
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [account.id, account.status, page, works.data, works.loading, works.error, showingEditor]);

  useLayoutEffect(() => {
    const main = pageRef.current?.closest("main") ?? scrollContainer.current;
    if (!main) return;
    scrollContainer.current = main;
    if (showingEditor) {
      main.scrollTop = 0;
      return;
    }
    main.scrollTop = workListPosition(account.id).scrollTop;
    const remember = () => rememberWorkListPosition(account.id, displayedPage, main.scrollTop);
    remember();
    main.addEventListener("scroll", remember, { passive: true });
    return () => main.removeEventListener("scroll", remember);
  }, [account.id, displayedPage, showingEditor]);

  /** Explicit refresh and successful writes bypass both list and cover caches */
  const refresh = () => {
    invalidateWorks(account.id);
    setCoverRevision((v) => v + 1);
    works.reload();
  };

  /** Route editor actions separately and confirm each list mutation */
  const onAction = (work: WorkSummary, action: WorkAction) => {
    if (action === "viewFeedback") {
      setFeedbackFor(work);
    }
    if (action === "update" || action === "submitReview") openDetail(work);
    if (action !== "update" && action !== "submitReview" && action !== "viewFeedback" && account.status === "active") {
      setActionMessage(null);
      setActionFor({ work, action });
    }
  };

  if (creatingFor && creatingFor === account?.id)
    return (
      <EditorRoute
        key={`new:${creatingFor}`}
        account={creatingFor}
        works={list}
        onClose={closeCreate}
        onSaved={() => {
          rememberWorkListPosition(account.id, 0, 0);
          setCreatingFor(null);
          setCreatedFor(creatingFor);
          setPage(0);
          refresh();
        }}
      />
    );

  if (viewing && viewing.account === account?.id)
    return (
      <EditorRoute
        key={`${viewing.account}:${viewing.work.itemId}`}
        work={viewing.work}
        account={viewing.account}
        works={list}
        onClose={closeView}
        onSaved={refresh}
      />
    );

  return (
    <div className={styles.page} ref={pageRef}>
      <PageHeader
        title="作品管理"
        subtitle={shown ? summary(list, shown.data.total) : "正在加载作品…"}
        actions={
          <>
            <Button onClick={refresh} disabled={works.loading} aria-busy={works.loading}>
              刷新
            </Button>
            <Button
              variant="primary"
              disabled={account?.status !== "active"}
              onPointerEnter={prepareCreate}
              onFocus={prepareCreate}
              onClick={() => {
                prepareCreate();
                setCreatingFor(account.id);
              }}
            >
              <Icon name="action.add" size={14} />
              新增作品
            </Button>
          </>
        }
      />

      {createdFor === account?.id && (
        <Notice>作品已创建，尚未提交审核。请在刷新后的列表中打开作品继续编辑或提审。</Notice>
      )}
      {actionMessage && (
        <div role="status">
          <Notice>{actionMessage}</Notice>
        </div>
      )}

      {works.error && (
        <Notice
          action={
            <TextButton tone="warning" onClick={refresh}>
              重试
            </TextButton>
          }
        >
          {page !== displayedPage ? `第 ${page + 1} 页加载失败，仍显示第 ${displayedPage + 1} 页：` : "作品加载失败："}
          {works.error.message}
        </Notice>
      )}

      <div className={styles.listArea} aria-busy={works.loading}>
        <span className={styles.loadStatus} role="status">
          {slowLoad && works.loading ? (page !== displayedPage ? `正在打开第 ${page + 1} 页…` : "正在更新作品…") : ""}
        </span>
        {list.length > 0 ? (
          <ul className={styles.grid} aria-label="作品" aria-busy={works.loading}>
            {list.map((work) => (
              <WorkTile
                key={work.itemId}
                refreshToken={coverRevision}
                account={account.id}
                work={work}
                onAction={onAction}
                onPrepare={prepare}
                canWrite={account.status === "active"}
                onOpenDetail={openDetail}
              />
            ))}
          </ul>
        ) : works.loading ? (
          <div role="status" aria-label="正在加载作品" className={styles.grid}>
            {LOADING_SLOTS.map((slot) => (
              <div className={styles.skeleton} key={slot} aria-hidden="true">
                <span className={styles.skeletonCover} />
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <Icon name="nav.works" size={48} className={styles.emptyIcon} />
            {works.loading ? (
              <span className={styles.emptyTitle}>正在加载作品…</span>
            ) : (
              <>
                <span className={styles.emptyTitle}>{works.error ? "作品加载失败" : "暂无作品"}</span>
                <span className={styles.emptyHint}>
                  {works.error ? "检查网络后点「重试」" : "点击「新增作品」，创建你的第一个作品"}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <Pagination page={displayedPage} pageCount={pageCount} onChange={setPage} note={`每页 ${PER_PAGE} 个`} />

      {feedbackFor && <ReviewFeedbackDialog work={feedbackFor} onClose={closeFeedback} />}
      {actionFor && (
        <WorkActionDialog
          key={`${account.id}:${actionFor.work.itemId}:${actionFor.action}`}
          work={actionFor.work}
          account={account.id}
          action={actionFor.action}
          onClose={closeAction}
          onRefresh={refresh}
          onCompleted={(message) => {
            setActionMessage(message);
            setActionFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
