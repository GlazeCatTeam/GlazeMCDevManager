import {
  Button,
  EmptyState,
  Icon,
  Pagination,
  Panel,
  type PromotionActivity,
  remoteImageUrl,
  Tag,
  useHostQuery,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "../PromotionPage.module.css";
import { activityStatus, dateText, QueryMessage } from "../shared";
import { ActivityContent, activityExcerpt } from "./ActivityContent";
import { ModuleForm } from "./ModuleForm";

/** Paginate activities without allowing previous-page responses to replace the new selection */
export function ActivitiesView({ account }: { account: string }) {
  const [page, setPage] = useState(0);
  return <ActivityPage key={page} account={account} page={page} onPage={setPage} />;
}

/** Browse campaign cards and inspect the selected activity in a fixed-height workspace */
function ActivityPage({ account, page, onPage }: { account: string; page: number; onPage: (page: number) => void }) {
  const query = useHostQuery("promotion.activities", { account, page });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = query.data?.records.find((entry) => entry.id === selectedId) ?? query.data?.records[0];
  return (
    <div className={styles.split}>
      <Panel
        className={styles.listPanel}
        title="作品活动"
        icon={<Icon name="nav.promotion" size={20} />}
        actions={
          <Button size="xs" disabled={query.loading} onClick={query.reload}>
            刷新
          </Button>
        }
      >
        <QueryMessage query={query} />
        <div className={styles.scroll}>
          {query.data?.records.map((activity) => (
            <button
              key={activity.id}
              type="button"
              className={styles.activityCard}
              data-selected={selected?.id === activity.id}
              aria-pressed={selected?.id === activity.id}
              onClick={() => setSelectedId(activity.id)}
            >
              {activity.banner && (
                <img className={styles.banner} src={remoteImageUrl(activity.banner) ?? undefined} alt="" />
              )}
              <div className={styles.row}>
                <Tag>{activityStatus(activity)}</Tag>
                <span className={styles.muted}>{activity.modules.length} 个赛道</span>
              </div>
              <strong>{activity.name}</strong>
              <p className={styles.excerpt}>{activityExcerpt(activity.description) || "查看活动规则与报名信息"}</p>
              <span className={styles.muted}>报名截止 {dateText(activity.applyEndAt)}</span>
            </button>
          ))}
          {query.data?.records.length === 0 && <EmptyState title="暂无作品活动" hint="平台发布新活动后将在这里显示" />}
        </div>
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil((query.data?.total ?? 0) / 10))}
          onChange={onPage}
          note={query.data ? `共 ${query.data.total} 个活动` : ""}
        />
      </Panel>
      {selected ? (
        <ActivityDetail
          key={selected.id}
          activity={selected}
          account={account}
          stale={Boolean(query.error) || query.loading}
        />
      ) : (
        <Panel className={styles.detailPanel} title="活动详情">
          <EmptyState title="选择一项作品活动" hint="查看活动规则、赛道与报名作品" />
        </Panel>
      )}
    </div>
  );
}

/** Preserve activity details while skipping enrollment queries for ended activities */
function ActivityDetail({
  account,
  activity,
  stale,
}: {
  account: string;
  activity: PromotionActivity;
  stale: boolean;
}) {
  const [moduleId, setModuleId] = useState(activity.modules[0]?.id ?? "");
  const module = activity.modules.find((item) => item.id === moduleId);
  const status = activityStatus(activity);
  return (
    <Panel className={styles.detailPanel} title="活动详情">
      <div className={styles.scroll}>
        <div className={styles.heading}>
          <Tag>{status}</Tag>
          <h2>{activity.name}</h2>
          <p className={styles.muted}>
            {dateText(activity.beginAt)} — {dateText(activity.endAt)} · 报名截止 {dateText(activity.applyEndAt)}
          </p>
        </div>
        <ActivityContent value={activity.description} />
        {activity.instruction && (
          <details className={styles.rules}>
            <summary>活动规则与说明</summary>
            <ActivityContent value={activity.instruction} />
          </details>
        )}
        <fieldset className={styles.modules} aria-label="活动赛道">
          {activity.modules.map((item) => (
            <Button
              key={item.id}
              size="xs"
              variant={item.id === moduleId ? "primary" : "secondary"}
              onClick={() => setModuleId(item.id)}
            >
              {item.name}
            </Button>
          ))}
        </fieldset>
        {status === "已结束" ? (
          <EmptyState title="活动已结束" hint="报名已关闭，仍可查看活动介绍和规则" />
        ) : module ? (
          <ModuleForm
            key={module.id}
            kind="review"
            account={account}
            activity={activity}
            module={module}
            disabled={stale || status !== "报名中"}
          />
        ) : (
          <EmptyState title="暂无报名赛道" />
        )}
      </div>
    </Panel>
  );
}
