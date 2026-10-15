import { Button, Icon, Pagination } from "@glaze/plugin-sdk";
import { useState } from "react";
import { type Work, works } from "./mock";
import type { WorkAction, WorkStatus } from "./status";
import styles from "./WorksPage.module.css";
import { WorkTile } from "./widgets/WorkTile";

const PER_PAGE = 9;

// Actions are no-ops until the NetEase client and the detail page exist
const noop = () => {};
const noopAction = (_work: Work, _action: WorkAction) => {};

/** One-line summary under the title */
function summary(list: Work[]): string {
  if (list.length === 0) {
    return "还没有作品";
  }
  const count = (status: WorkStatus) => list.filter((w) => w.status === status).length;
  return `共 ${list.length} 个作品 · 已上架 ${count("online")} · 审核中 ${count("reviewing")} · 未通过 ${count("reject")}`;
}

/** Works management: published works as fixed-size tiles, nine per page, like MCDevManager's 上架管理 */
export function WorksPage() {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(works.length / PER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const visible = works.slice(current * PER_PAGE, (current + 1) * PER_PAGE);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>作品管理</h1>
          <span className={styles.subtitle}>{summary(works)}</span>
        </div>
        <div className={styles.toolbar}>
          <Button onClick={noop}>刷新</Button>
          <Button variant="primary" onClick={noop}>
            <Icon name="action.add" size={14} />
            新增作品
          </Button>
        </div>
      </div>

      {works.length > 0 ? (
        <>
          <ul className={styles.grid} aria-label="已发布的作品">
            {visible.map((work) => (
              <WorkTile key={work.itemId} work={work} onAction={noopAction} onOpenDetail={noop} />
            ))}
          </ul>
          <Pagination page={current} pageCount={pageCount} onChange={setPage} note={`每页 ${PER_PAGE} 个`} />
        </>
      ) : (
        <div className={styles.empty}>
          <Icon name="nav.works" size={48} className={styles.emptyIcon} />
          <span className={styles.emptyTitle}>暂无作品</span>
          <span className={styles.subtitle}>在开发者平台创建作品后，会显示在这里</span>
        </div>
      )}
    </div>
  );
}
