import {
  Button,
  callHost,
  EmptyState,
  Notice,
  type PromotionActivity,
  type PromotionModule,
  SearchField,
  TextArea,
  useHostQuery,
} from "@glaze/plugin-sdk";
import { useRef, useState } from "react";
import styles from "../PromotionPage.module.css";
import { ConfirmAction, QueryMessage, Status } from "../shared";
import { ActivityApplicationDialog } from "./ActivityApplicationDialog";
import { ActivityContent, activityExcerpt } from "./ActivityContent";

/** Share enrollment flows, treating the platform's ended response as a normal closed state */
export function ModuleForm({
  account,
  kind,
  activity,
  module,
  disabled,
}: {
  account: string;
  kind: "review" | "discount";
  activity: PromotionActivity;
  module: PromotionModule;
  disabled: boolean;
}) {
  const query = useHostQuery("promotion.module", { account, kind, activityId: activity.id, moduleId: module.id });
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [intro, setIntro] = useState("");
  const [discount, setDiscount] = useState(String(module.minDiscount ?? ""));
  const [partitionId, setPartitionId] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const applicationButton = useRef<HTMLButtonElement>(null);
  const discountMode = kind === "discount";
  const candidates = (query.data?.candidates ?? []).filter(
    (item) => !query.data?.joined.some((joined) => joined.id === item.id),
  );
  const visible = candidates.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()));
  const chosen = candidates.filter((item) => selected.includes(item.id));
  const discountValid =
    !discountMode ||
    (discount.trim() !== "" &&
      Number.isInteger(Number(discount)) &&
      module.minDiscount !== null &&
      module.maxDiscount !== null &&
      Number(discount) >= module.minDiscount &&
      Number(discount) <= module.maxDiscount);
  const blocked = disabled || query.loading || Boolean(query.error);

  /** Clear obsolete selections and recheck both lists following a successful write */
  function completed() {
    setSelected([]);
    setIntro("");
    setApplicationOpen(false);
    setSuccess("操作成功，正在更新报名记录");
    query.reload();
    setRevision((value) => value + 1);
  }

  /** Toggle a candidate; review registrations always contain a single work */
  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : discountMode ? [...ids, id] : [id]));
  }

  if (query.error?.kind === "business" && query.error.message.trim() === "活动已结束")
    return <EmptyState title="活动已结束" hint="报名已关闭，仍可查看活动介绍和规则" />;

  return (
    <div className={styles.form}>
      <ActivityContent value={module.description} />
      <QueryMessage query={query} />
      {success && (
        <p role="status" className={styles.success}>
          {success}
        </p>
      )}
      <div className={styles.row}>
        <h3>选择报名作品</h3>
        <Button
          size="xs"
          disabled={query.loading}
          onClick={() => {
            setSuccess("");
            setSelected([]);
            query.reload();
          }}
        >
          刷新作品
        </Button>
      </div>
      {disabled && <p className={styles.muted}>当前不可报名，可查看已报名作品和活动规则。</p>}
      <SearchField value={search} onChange={setSearch} placeholder="搜索候选作品名称或 ID" label="搜索候选作品" />
      <div className={styles.candidates}>
        {visible.map((item) => (
          <label className={styles.candidate} key={item.id} data-selected={selected.includes(item.id)}>
            <input
              type={discountMode ? "checkbox" : "radio"}
              name="candidate"
              checked={selected.includes(item.id)}
              disabled={blocked}
              onChange={() => toggle(item.id)}
            />
            <span>
              <strong>{item.name}</strong>
              <small>ID {item.id}</small>
            </span>
            <span className={styles.muted}>
              {item.price === null
                ? "价格未提供"
                : `${item.price} ${item.priceType === "diamond" ? "钻石" : item.priceType === "point" ? "绿宝石" : item.priceType === "free" ? "免费" : item.priceType}`}
            </span>
          </label>
        ))}
        {query.data && visible.length === 0 && (
          <EmptyState
            title={candidates.length ? "没有匹配的作品" : "暂无可报名作品"}
            hint={candidates.length ? "试试其他名称或 ID" : "候选作品由平台按赛道规则筛选"}
          />
        )}
      </div>
      {discountMode && (
        <div className={styles.fields}>
          <label className={styles.field}>
            折扣比例（%）
            <input
              type="number"
              min={module.minDiscount ?? 0}
              max={module.maxDiscount ?? 100}
              step={1}
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
            <small>
              平台范围 {module.minDiscount ?? "—"}% — {module.maxDiscount ?? "—"}%
            </small>
          </label>
          <label className={styles.field}>
            活动分区
            <select value={partitionId} onChange={(event) => setPartitionId(event.target.value)}>
              <option value="">默认分区</option>
              {activity.partitions.map((partition) => (
                <option key={partition.id} value={partition.id}>
                  {partition.name}
                </option>
              ))}
            </select>
            <small>
              {activityExcerpt(activity.partitions.find((item) => item.id === partitionId)?.rule ?? "") ||
                "可选，由平台校验作品分区资格"}
            </small>
          </label>
        </div>
      )}
      {discountMode && (
        <>
          <TextArea
            id="promotion-intro"
            label="参与说明"
            value={intro}
            onChange={setIntro}
            rows={3}
            placeholder="介绍作品特色与本次活动的关联"
          />
          {intro.length > 10000 && <Notice>参与说明内容过长，请精简后再提交。</Notice>}
          {!discountValid && <Notice>请输入平台允许范围内的整数折扣比例。</Notice>}
        </>
      )}
      <div className={styles.row}>
        <span className={styles.muted}>已选择 {chosen.length} 个作品</span>
        {discountMode ? (
          <ConfirmAction
            key={revision}
            label="报名特卖"
            title="确认参与折扣特卖"
            disabled={blocked || !chosen.length || !discountValid || intro.length > 10000}
            action={() =>
              callHost("promotion.join", {
                account,
                kind,
                activityId: activity.id,
                moduleId: module.id,
                itemIds: chosen.map((item) => item.id),
                intro,
                discount: Number(discount),
                partitionId,
                images: [],
                videos: [],
              })
            }
            onSuccess={completed}
          >
            <strong>
              {activity.name} · {module.name}
            </strong>
            <ul>
              {chosen.map((item) => (
                <li key={item.id}>
                  {item.name}（{item.id}）
                </li>
              ))}
            </ul>
            <p>
              折扣比例：{discount}% · 分区：
              {activity.partitions.find((item) => item.id === partitionId)?.name ?? "默认分区"}
            </p>
            <p className={styles.prose}>{intro || "未填写参与说明"}</p>
          </ConfirmAction>
        ) : (
          <Button
            variant="primary"
            disabled={blocked || !chosen.length}
            onClick={(event) => {
              applicationButton.current = event.currentTarget;
              setApplicationOpen(true);
            }}
          >
            填写申请
          </Button>
        )}
      </div>
      {!discountMode && chosen[0] && (
        <ActivityApplicationDialog
          key={chosen[0].id}
          account={account}
          activity={activity}
          module={module}
          work={chosen[0]}
          open={applicationOpen}
          disabled={blocked}
          onClose={() => {
            setApplicationOpen(false);
            applicationButton.current?.focus();
          }}
          onSuccess={completed}
        />
      )}
      <div className={styles.divider} />
      <h3>
        已报名作品 <span className={styles.muted}>{query.data?.joined.length ?? "—"}</span>
      </h3>
      {query.data?.joined.map((item) => (
        <div className={styles.joined} key={item.id}>
          <span>
            <strong>{item.name}</strong>
            <small>
              ID {item.id}
              {item.discount !== null ? ` · 折扣 ${item.discount}%` : ""}
            </small>
          </span>
          <Status value={item.status} />
          {discountMode && !["approved", "rejected", "accept", "reject"].includes(item.status) && (
            <ConfirmAction
              key={`${item.id}:${revision}`}
              label="取消参与"
              title="确认取消特卖报名"
              danger
              disabled={query.loading || Boolean(query.error)}
              action={() => callHost("promotion.cancelDiscount", { account, activityId: activity.id, itemId: item.id })}
              onSuccess={completed}
            >
              <p>
                将取消「{item.name}」在「{activity.name}」中的折扣特卖报名。
              </p>
            </ConfirmAction>
          )}
        </div>
      ))}
      {query.data?.joined.length === 0 && <p className={styles.muted}>暂无已报名作品</p>}
    </div>
  );
}
