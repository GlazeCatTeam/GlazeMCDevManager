import {
  Button,
  Icon,
  Notice,
  PageHeader,
  Pagination,
  TextButton,
  useHostQuery,
  type WorkStatus,
  type WorkSummary,
} from "@glaze/plugin-sdk";
import { useCallback, useState } from "react";
import type { WorkAction } from "./status";
import styles from "./WorksPage.module.css";
import { ReviewFeedbackDialog } from "./widgets/ReviewFeedbackDialog";
import { WorkTile } from "./widgets/WorkTile";

const PER_PAGE = 9;

// The detail page does not exist yet
const noop = () => {};

/** One-line summary under the title */
function summary(list: WorkSummary[]): string {
  if (list.length === 0) {
    return "还没有作品";
  }
  const count = (status: WorkStatus) => list.filter((w) => w.status === status).length;
  return `共 ${list.length} 个作品 · 已上架 ${count("online")} · 审核中 ${count("reviewing")} · 未通过 ${count("reject")}`;
}

/** Works management: the account's works as fixed-size tiles, nine per page, like MCDevManager's 上架管理 */
export function WorksPage() {
  const works = useHostQuery("works.list");
  const [page, setPage] = useState(0);
  const [feedbackFor, setFeedbackFor] = useState<WorkSummary | null>(null);
  const closeFeedback = useCallback(() => setFeedbackFor(null), []);

  const list = works.data ?? [];
  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const visible = list.slice(current * PER_PAGE, (current + 1) * PER_PAGE);

  /** Only read actions are connected; write buttons are disabled in the tiles */
  const onAction = (work: WorkSummary, action: WorkAction) => {
    if (action === "viewFeedback") {
      setFeedbackFor(work);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="作品管理"
        subtitle={works.data ? summary(works.data) : "正在加载作品…"}
        actions={
          <>
            <Button onClick={works.reload} disabled={works.loading}>
              {works.loading ? "刷新中…" : "刷新"}
            </Button>
            <Button variant="primary" disabled title="暂未接入，请在开发者平台操作">
              <Icon name="action.add" size={14} />
              新增作品
            </Button>
          </>
        }
      />

      {works.error && (
        <Notice
          action={
            <TextButton tone="warning" onClick={works.reload}>
              重试
            </TextButton>
          }
        >
          作品加载失败：{works.error.message}
        </Notice>
      )}

      {list.length > 0 ? (
        <>
          <ul className={styles.grid} aria-label="作品" aria-busy={works.loading}>
            {visible.map((work) => (
              <WorkTile key={work.itemId} work={work} onAction={onAction} onOpenDetail={noop} />
            ))}
          </ul>
          <Pagination page={current} pageCount={pageCount} onChange={setPage} note={`每页 ${PER_PAGE} 个`} />
        </>
      ) : (
        <div className={styles.empty}>
          <Icon name="nav.works" size={48} className={styles.emptyIcon} />
          {works.loading ? (
            <span className={styles.emptyTitle}>正在加载作品…</span>
          ) : (
            <>
              <span className={styles.emptyTitle}>{works.error ? "作品加载失败" : "暂无作品"}</span>
              <span className={styles.emptyHint}>
                {works.error ? "检查网络后点「重试」" : "在开发者平台创建作品后，会显示在这里"}
              </span>
            </>
          )}
        </div>
      )}

      {feedbackFor && <ReviewFeedbackDialog work={feedbackFor} onClose={closeFeedback} />}
    </div>
  );
}
