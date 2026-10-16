import { Button, EmptyState, Icon, Panel, type PromotionActivity, Tag, useHostQuery } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "../PromotionPage.module.css";
import { activityStatus, dateText, QueryMessage } from "../shared";
import { ActivityContent } from "./ActivityContent";
import { ModuleForm } from "./ModuleForm";

/** Load the platform's current discount campaign and keep failures visible */
export function DiscountView({ account }: { account: string }) {
  const query = useHostQuery("promotion.discount", { account });
  return (
    <>
      <QueryMessage query={query} />
      {query.data?.activity ? (
        <DiscountActivity
          key={query.data.activity.id}
          account={account}
          activity={query.data.activity}
          stale={query.loading || Boolean(query.error)}
          refresh={query.reload}
        />
      ) : (
        <Panel
          className={styles.detailPanel}
          title="折扣特卖"
          actions={
            <Button size="xs" disabled={query.loading} onClick={query.reload}>
              刷新
            </Button>
          }
        >
          {query.data && <EmptyState title="暂无折扣特卖活动" hint="有新的特卖活动时，可以在这里选择作品参与" />}
        </Panel>
      )}
    </>
  );
}

/** Keep campaign rules alongside the enrollment form with aligned panel bottoms */
function DiscountActivity({
  account,
  activity,
  stale,
  refresh,
}: {
  account: string;
  activity: PromotionActivity;
  stale: boolean;
  refresh: () => void;
}) {
  const [moduleId, setModuleId] = useState(activity.modules[0]?.id ?? "");
  const module = activity.modules.find((item) => item.id === moduleId);
  return (
    <div className={styles.split}>
      <Panel
        title="本期特卖"
        icon={<Icon name="nav.income" size={20} />}
        className={styles.listPanel}
        actions={
          <Button size="xs" disabled={stale} onClick={refresh}>
            刷新
          </Button>
        }
      >
        <div className={styles.scroll}>
          <Tag>{activityStatus(activity)}</Tag>
          <h2>{activity.name}</h2>
          <ActivityContent value={activity.description} />
          <dl className={styles.facts}>
            <div>
              <dt>活动时间</dt>
              <dd>
                {dateText(activity.beginAt)} — {dateText(activity.endAt)}
              </dd>
            </div>
            <div>
              <dt>报名截止</dt>
              <dd>{dateText(activity.applyEndAt)}</dd>
            </div>
            {module && (
              <>
                <div>
                  <dt>折扣范围</dt>
                  <dd>
                    {module.minDiscount ?? "—"}% — {module.maxDiscount ?? "—"}%
                  </dd>
                </div>
                <div>
                  <dt>最低钻石价格</dt>
                  <dd>{module.minDiamond ?? "未提供"}</dd>
                </div>
                <div>
                  <dt>调价间隔要求</dt>
                  <dd>{module.priceUpdateDays === null ? "未提供" : `${module.priceUpdateDays} 天`}</dd>
                </div>
              </>
            )}
          </dl>
          {activity.instruction && (
            <details className={styles.rules}>
              <summary>特卖规则</summary>
              <ActivityContent value={activity.instruction} />
            </details>
          )}
        </div>
      </Panel>
      <Panel title="参与特卖" className={styles.detailPanel}>
        <div className={styles.scroll}>
          <fieldset className={styles.modules} aria-label="特卖赛道">
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
          {activityStatus(activity) === "已结束" ? (
            <EmptyState title="活动已结束" hint="报名已关闭，仍可查看活动介绍和规则" />
          ) : module ? (
            <ModuleForm
              key={module.id}
              kind="discount"
              account={account}
              activity={activity}
              module={module}
              disabled={stale || Date.now() / 1000 > activity.applyEndAt}
            />
          ) : (
            <EmptyState title="暂无特卖赛道" />
          )}
        </div>
      </Panel>
    </div>
  );
}
