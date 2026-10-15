import { Panel, SegmentedControl } from "@glaze/plugin-sdk";
import { useState } from "react";
import { formatValue, orderTotals, queryOrders, type RealtimeDay, resources } from "../mock";
import { DataTable, mutedClass, positiveClass } from "../widgets/DataTable";
import { InlineSelect } from "../widgets/InlineSelect";
import { ResourceCard, ResourceGrid } from "../widgets/ResourceCard";
import { StatStrip } from "../widgets/StatStrip";
import styles from "./Views.module.css";

const dayOptions = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
] as const;

const dayText: Record<RealtimeDay, string> = {
  today: "2026-10-15 · 截至 14:00",
  yesterday: "2026-10-14 · 全天",
};

const resourceOptions = [
  { value: "all", label: "全部资源" },
  ...resources.map((resource) => ({ value: resource.id, label: resource.name })),
];

const currencyOptions = [
  { value: "all", label: "全部" },
  { value: "diamond", label: "钻石" },
  { value: "emerald", label: "绿宝石" },
];

const currencyName = { diamond: "钻石", emerald: "绿宝石" };

/** Today's or yesterday's income per resource, with an order list filtered by resource and currency */
export function RealtimeView() {
  const [day, setDay] = useState<RealtimeDay>("today");
  const [resourceId, setResourceId] = useState("all");
  const [currency, setCurrency] = useState("all");
  const orders = queryOrders(day);
  const totals = orderTotals(orders);
  const visible = orders.filter(
    (order) =>
      (resourceId === "all" || resourceId === order.resourceId) && (currency === "all" || currency === order.currency),
  );

  return (
    <>
      <Panel className={styles.compactFilters} aria-label="实时收益筛选">
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <SegmentedControl label="实时收益日期" options={dayOptions} value={day} onChange={setDay} />
          <span className={styles.dateRange}>{dayText[day]}</span>
        </div>
      </Panel>
      <StatStrip
        items={[
          { label: "钻石收益", value: formatValue(totals.diamonds), note: "钻石 · 全部资源" },
          { label: "绿宝石收益", value: formatValue(totals.emeralds), note: "绿宝石 · 全部资源" },
          {
            label: "付费订单",
            value: formatValue(totals.purchases),
            note: `${day === "today" ? "今天" : "昨天"} · 笔`,
          },
        ]}
      />
      <Panel
        className={styles.realtimeResourcePanel}
        title="各资源收益"
        actions={<span className={styles.muted}>{resources.length} 个资源</span>}
      >
        <ResourceGrid>
          {resources.map((resource) => {
            const resourceTotals = orderTotals(orders.filter((order) => order.resourceId === resource.id));
            return (
              <ResourceCard
                key={resource.id}
                resource={resource}
                selected={resourceId === resource.id}
                onClick={() => setResourceId(resourceId === resource.id ? "all" : resource.id)}
                metrics={[
                  { label: "钻石", value: formatValue(resourceTotals.diamonds) },
                  { label: "绿宝石", value: formatValue(resourceTotals.emeralds) },
                  { label: "订单", value: `${resourceTotals.purchases} 笔` },
                ]}
              />
            );
          })}
        </ResourceGrid>
      </Panel>
      <Panel
        className={styles.ordersPanel}
        title="订单明细"
        actions={
          <span className={styles.muted} aria-live="polite">
            {visible.length} 笔
          </span>
        }
      >
        <div className={styles.orderFilters}>
          <InlineSelect label="资源" value={resourceId} options={resourceOptions} onChange={setResourceId} />
          <InlineSelect label="支付方式" value={currency} options={currencyOptions} onChange={setCurrency} />
        </div>
        <DataTable
          caption="模拟付费订单明细"
          columns={["订单号", "资源", "时间", "收益", "状态"]}
          emptyText="当前筛选下没有订单"
          rows={visible.map((order) => (
            <tr key={order.id}>
              <td className={mutedClass}>{order.id}</td>
              <td>{resources.find((resource) => resource.id === order.resourceId)?.name}</td>
              <td>{order.time.slice(11)}</td>
              <td>
                {formatValue(order.amount)} {currencyName[order.currency]}
              </td>
              <td className={positiveClass}>已完成</td>
            </tr>
          ))}
        />
      </Panel>
    </>
  );
}
