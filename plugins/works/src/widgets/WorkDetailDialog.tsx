import {
  Button,
  Dialog,
  Notice,
  remoteImageUrl,
  Tag,
  TextButton,
  useHostQuery,
  type WorkSummary,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { formatDateTime, priceText } from "../format";
import { statusLabels } from "../status";
import styles from "./WorkDetailDialog.module.css";

export interface WorkDetailDialogProps {
  work: WorkSummary;
  onClose: () => void;
}

/** Banner picture; hidden when the work has none or it fails to load */
function Banner({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = remoteImageUrl(url);
  if (!src || failed) {
    return null;
  }
  return <img className={styles.banner} src={src} alt="" draggable={false} onError={() => setFailed(true)} />;
}

/** Read-only overview of one work: banner, status, price, ids and every known time */
export function WorkDetailDialog({ work, onClose }: WorkDetailDialogProps) {
  const detail = useHostQuery("works.get", { itemId: work.itemId });
  const data = detail.data;
  const weakOffline = data?.weakOffline ?? work.weakOffline;
  const weakOfflineReason = data?.weakOffline === undefined ? work.weakOfflineReason : data.weakOfflineReason;
  const rows: [string, string | null][] = [
    ["状态", statusLabels[work.status]],
    ["价格", priceText(work)],
    ["作品 ID", work.itemId],
    ["创建", formatDateTime(work.createTime)],
    ["提交审核", work.applyReviewTime ? formatDateTime(work.applyReviewTime) : null],
    ["首次上线", data?.firstOnlineTime ? formatDateTime(data.firstOnlineTime) : null],
    ["最近上线", data?.onlineTime ? formatDateTime(data.onlineTime) : null],
    ["定时上架", data?.appointOnlineTime ? formatDateTime(data.appointOnlineTime) : null],
    ["弱下架原因", weakOffline ? (weakOfflineReason ?? "未说明") : null],
  ];

  return (
    <Dialog title={work.name} onClose={onClose} actions={<Button onClick={onClose}>关闭</Button>}>
      {detail.error && (
        <Notice
          action={
            <TextButton tone="warning" onClick={detail.reload}>
              重试
            </TextButton>
          }
        >
          详情加载失败：{detail.error.message}
        </Notice>
      )}
      <Banner key={data?.bannerUrl ?? "none"} url={data?.bannerUrl ?? null} />
      {(work.isOriginal || work.syncPc || weakOffline) && (
        <div className={styles.tags}>
          {work.isOriginal && <Tag>原创</Tag>}
          {work.syncPc && <Tag>PE + PC</Tag>}
          {weakOffline && <Tag tone="warning">弱下架</Tag>}
        </div>
      )}
      <dl className={styles.rows}>
        {rows
          .filter((row): row is [string, string] => row[1] !== null)
          .map(([label, value]) => (
            <div key={label} className={styles.row}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {detail.loading && !data && <span className={styles.muted}>正在加载上线时间和横幅图…</span>}
    </Dialog>
  );
}
