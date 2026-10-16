import { avatarColorsFor, Button, remoteImageUrl, Tag, TextButton, type WorkSummary } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate, formatDateTime } from "../format";
import { actionLabels, actionsFor, readActions, statusLabels, statusTones, type WorkAction } from "../status";
import { useWorkCover } from "../useWorkQuery";
import { WorkPrice } from "./WorkPrice";
import styles from "./WorkTile.module.css";

export interface WorkTileProps {
  work: WorkSummary;
  account: string;
  refreshToken: number;
  /** Read actions, editor entry points and confirmed list operations */
  onAction: (work: WorkSummary, action: WorkAction) => void;
  onOpenDetail: (work: WorkSummary) => void;
  onOpenAnalytics: (work: WorkSummary) => void;
  onPrepare: (work: WorkSummary) => void;
  canWrite: boolean;
}

const toneClass = {
  online: styles.online,
  progress: styles.progress,
  rejected: styles.rejected,
  offline: styles.offline,
  neutral: styles.neutral,
};

/** Square icon from the work's detail; a generated block until it loads or when there is none */
function Cover({ iconUrl, seed }: { iconUrl: string | null; seed: string }) {
  const [failed, setFailed] = useState(false);
  const src = remoteImageUrl(iconUrl);
  if (src && !failed) {
    return <img className={styles.cover} src={src} alt="" draggable={false} onError={() => setFailed(true)} />;
  }
  const colors = avatarColorsFor(seed);
  return (
    <span className={styles.cover} style={{ background: colors.face }} aria-hidden="true">
      <span className={styles.coverTop} style={{ background: colors.hair }} />
    </span>
  );
}

/** Fixed-size tile with data and detail entry points plus available work actions */
export function WorkTile({
  work,
  account,
  refreshToken,
  onAction,
  onOpenDetail,
  onOpenAnalytics,
  onPrepare,
  canWrite,
}: WorkTileProps) {
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A short hover delay avoids fetching every card swept by the pointer */
  const cancelHover = useCallback(() => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);
  useEffect(() => cancelHover, [cancelHover]);
  const detail = useWorkCover(account, work.itemId, refreshToken);
  const actions = actionsFor(work.status);
  const onlineTime = detail.data?.onlineTime ?? null;
  const appointOnlineTime = detail.data?.appointOnlineTime;
  const scheduled = work.status === "appoint_online" || work.status === "accept";
  const dates =
    onlineTime && onlineTime !== "UNKNOWN"
      ? `创建 ${formatDate(work.createTime)}  ·  上线 ${formatDate(onlineTime)}`
      : `创建 ${formatDate(work.createTime)}`;

  return (
    <li
      className={styles.tile}
      onPointerEnter={() => {
        cancelHover();
        hoverTimer.current = setTimeout(() => onPrepare(work), 120);
      }}
      onPointerLeave={cancelHover}
      onFocusCapture={() => {
        cancelHover();
        onPrepare(work);
      }}
    >
      <div className={styles.head}>
        <Cover key={detail.data?.iconUrl ?? "none"} iconUrl={detail.data?.iconUrl ?? null} seed={work.itemId} />
        <span className={styles.titles}>
          <span className={styles.name}>{work.name}</span>
          <span className={`${styles.status} ${toneClass[statusTones[work.status]]}`}>{statusLabels[work.status]}</span>
        </span>
        <div className={styles.links}>
          <TextButton aria-label={`查看 ${work.name} 数据`} onClick={() => onOpenAnalytics(work)}>
            数据
          </TextButton>
          <TextButton aria-label={`查看 ${work.name} 详情`} onClick={() => onOpenDetail(work)}>
            详情 ›
          </TextButton>
        </div>
      </div>

      <div className={styles.meta}>
        <span className={styles.price}>
          <WorkPrice price={work.price} priceType={work.priceType} />
        </span>
        {work.isOriginal && <Tag>原创</Tag>}
        <Tag>{work.syncPc ? "PE + PC" : work.platform === "pc" ? "PC" : "PE"}</Tag>
        {work.weakOffline && <Tag tone="warning">弱下架</Tag>}
      </div>

      <div className={styles.dates}>
        <span title={dates}>{dates}</span>
        {scheduled && appointOnlineTime && appointOnlineTime !== "UNKNOWN" && (
          <span>定时上架 {formatDateTime(appointOnlineTime)}</span>
        )}
      </div>

      <div className={styles.actions}>
        {actions.map((action) => {
          const priceUnavailable = action === "changePrice" && (work.isPrerequisite || work.priceType === "free");
          const pending = (!readActions.has(action) && !canWrite) || priceUnavailable;
          const reason = priceUnavailable ? "免费作品和前置模组不支持独立调价" : "请先恢复账号会话";
          return action === "delete" ? (
            <TextButton
              key={action}
              tone="danger"
              className={styles.delete}
              disabled={pending}
              title={pending ? reason : undefined}
              onClick={() => onAction(work, action)}
            >
              {actionLabels[action]}
            </TextButton>
          ) : (
            <Button
              key={action}
              size="xs"
              disabled={pending}
              title={pending ? reason : undefined}
              onClick={() => onAction(work, action)}
            >
              {actionLabels[action]}
            </Button>
          );
        })}
      </div>
    </li>
  );
}
