import { Button, Tag, TextButton } from "@glaze/plugin-sdk";
import type { Work } from "../mock";
import { actionLabels, actionsFor, statusLabels, statusTones, type WorkAction } from "../status";
import styles from "./WorkTile.module.css";

export interface WorkTileProps {
  work: Work;
  onAction: (work: Work, action: WorkAction) => void;
  onOpenDetail: (work: Work) => void;
}

/** Price as shown to players, e.g. "300 钻石" or "免费" */
function priceText(work: Work): string {
  if (work.priceType === "free" || work.price <= 0) {
    return "免费";
  }
  return `${work.price} ${work.priceType === "point" ? "绿宝石" : "钻石"}`;
}

const toneClass = {
  online: styles.online,
  progress: styles.progress,
  rejected: styles.rejected,
  offline: styles.offline,
  neutral: styles.neutral,
};

/** Fixed-size tile for one published work: status, price, dates and the actions its status allows */
export function WorkTile({ work, onAction, onOpenDetail }: WorkTileProps) {
  const isFree = work.priceType === "free" || work.price <= 0;
  const actions = actionsFor(work.status, isFree);
  const dates = work.onlineTime ? `创建 ${work.createTime}  ·  上线 ${work.onlineTime}` : `创建 ${work.createTime}`;

  return (
    <li className={styles.tile}>
      <div className={styles.head}>
        <span className={styles.cover} style={{ background: work.cover.face }} aria-hidden="true">
          <span className={styles.coverTop} style={{ background: work.cover.hair }} />
        </span>
        <span className={styles.titles}>
          <span className={styles.name}>{work.itemName}</span>
          <span className={`${styles.status} ${toneClass[statusTones[work.status]]}`}>{statusLabels[work.status]}</span>
        </span>
        <TextButton
          className={styles.detail}
          aria-label={`查看 ${work.itemName} 详情`}
          onClick={() => onOpenDetail(work)}
        >
          详情 ›
        </TextButton>
      </div>

      <div className={styles.meta}>
        <span className={styles.price}>{priceText(work)}</span>
        {work.isOriginal && <Tag>原创</Tag>}
        {work.syncPcFlag && <Tag>PE + PC</Tag>}
        {work.weakOffline && <Tag tone="warning">弱下架</Tag>}
      </div>

      <span className={styles.dates}>{dates}</span>

      <div className={styles.actions}>
        {actions.map((action) =>
          action === "delete" ? (
            <TextButton key={action} tone="danger" className={styles.delete} onClick={() => onAction(work, action)}>
              {actionLabels[action]}
            </TextButton>
          ) : (
            <Button key={action} size="xs" onClick={() => onAction(work, action)}>
              {actionLabels[action]}
            </Button>
          ),
        )}
      </div>
    </li>
  );
}
