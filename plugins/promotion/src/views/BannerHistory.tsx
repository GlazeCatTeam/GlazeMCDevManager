import {
  type BannerApplication,
  Button,
  Dialog,
  EmptyState,
  Pagination,
  TextButton,
  useHostQuery,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { dateText, QueryMessage, Status } from "../shared";
import { BannerPreview } from "./BannerPreview";
import styles from "./BannerWorkspace.module.css";
import { bannerCopyFields } from "./banner-model";

interface HistoryProps {
  account: string;
  onEdit: (application: BannerApplication) => void;
  onReuse: (application: BannerApplication) => void;
  onNew: () => void;
}

/** Keep pagination requests isolated and let users return to their existing draft */
export function BannerHistory(props: HistoryProps) {
  const [page, setPage] = useState(0);
  return <HistoryPage key={page} {...props} page={page} onPage={setPage} />;
}

/** Scan applications in a full-width table, opening their long content only on demand */
function HistoryPage({
  account,
  onEdit,
  onReuse,
  onNew,
  page,
  onPage,
}: HistoryProps & { page: number; onPage: (page: number) => void }) {
  const query = useHostQuery("promotion.applications", { account, page });
  const [detail, setDetail] = useState<BannerApplication | null>(null);
  return (
    <section className={styles.panel} aria-label="轮播图申请记录">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>跟进审核与展示进度</span>
          <h2>
            申请记录 <small>{query.data ? `共 ${query.data.total} 条` : ""}</small>
          </h2>
        </div>
        <div className={styles.inline}>
          <Button disabled={query.loading} onClick={query.reload}>
            刷新记录
          </Button>
          <Button variant="primary" onClick={onNew}>
            返回申请
          </Button>
        </div>
      </header>
      <div className={styles.body}>
        <QueryMessage query={query} />
        {query.data?.records.length === 0 && (
          <div className={styles.historyEmpty}>
            <EmptyState title="还没有轮播图申请" hint="选好作品和宣传图后，提交的申请会出现在这里" />
            <Button onClick={onNew}>去填写申请</Button>
          </div>
        )}
        {Boolean(query.data?.records.length) && (
          <div className={styles.tableWrap}>
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>推广作品</th>
                  <th>展示日期</th>
                  <th>审核状态</th>
                  <th>申请日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.records.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.itemName}</strong>
                      <small>{item.position || "PE 首页轮播图"}</small>
                    </td>
                    <td>{dateText(item.startTime)}</td>
                    <td>
                      <Status value={item.status} />
                    </td>
                    <td>{dateText(item.applyTime)}</td>
                    <td>
                      <div className={styles.inline}>
                        <TextButton onClick={() => setDetail(item)}>查看详情</TextButton>
                        {["init", "reviewing", "reviewing_1", "reviewing_2", "to_modify", "ready"].includes(
                          item.status,
                        ) && (
                          <TextButton disabled={query.loading || Boolean(query.error)} onClick={() => onEdit(item)}>
                            修改申请
                          </TextButton>
                        )}
                        <TextButton disabled={query.loading || Boolean(query.error)} onClick={() => onReuse(item)}>
                          复用内容
                        </TextButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className={styles.historyFooter}>
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil((query.data?.total ?? 0) / 10))}
          onChange={onPage}
          note="每页 10 条"
        />
        <span className={styles.muted}>审核状态以平台返回为准。复用内容会创建新草稿，不会自动提交。</span>
      </div>
      {detail && (
        <Dialog
          title="轮播图申请详情"
          onClose={() => setDetail(null)}
          actions={<Button onClick={() => setDetail(null)}>关闭</Button>}
        >
          <strong>{detail.itemName}</strong>
          <p>
            {dateText(detail.startTime)} · <Status value={detail.status} />
          </p>
          {detail.imageUrl && <BannerPreview url={detail.imageUrl} alt="申请宣传图" />}
          {bannerCopyFields.map(({ key, label }) => (
            <div key={key} className={styles.reviewCopy}>
              <h4>{label}</h4>
              <p>{detail[key] || "未填写"}</p>
            </div>
          ))}
        </Dialog>
      )}
    </section>
  );
}
