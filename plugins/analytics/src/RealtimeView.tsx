import { Panel } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./AnalyticsPage.module.css";
import { Choices, StatStrip } from "./AnalyticsParts";
import { formatValue, orderTotals, queryOrders, type RealtimeDay, resources } from "./mock";

/** Local realtime preview with currency-safe totals and filterable order details */
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
          <Choices
            label="实时收益日期"
            options={[
              { value: "today", label: "今天" },
              { value: "yesterday", label: "昨天" },
            ]}
            value={day}
            onChange={setDay}
          />
          <span className={styles.dateRange}>{day === "today" ? "2026-10-15 · 截至 14:00" : "2026-10-14 · 全天"}</span>
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
        <div className={styles.resourceGrid}>
          {resources.map((resource) => {
            const resourceTotals = orderTotals(orders.filter((order) => order.resourceId === resource.id));
            return (
              <button
                type="button"
                key={resource.id}
                className={
                  resourceId === resource.id ? `${styles.resourceCard} ${styles.activeCard}` : styles.resourceCard
                }
                onClick={() => setResourceId(resourceId === resource.id ? "all" : resource.id)}
                aria-pressed={resourceId === resource.id}
                aria-label={`筛选${resource.name}的订单`}
              >
                <strong className={styles.resourceName}>
                  <span className={styles.swatch} style={{ color: resource.color }} />
                  {resource.name}
                </strong>
                <dl className={styles.cardMetrics}>
                  <div>
                    <dt>钻石</dt>
                    <dd>{formatValue(resourceTotals.diamonds)}</dd>
                  </div>
                  <div>
                    <dt>绿宝石</dt>
                    <dd>{formatValue(resourceTotals.emeralds)}</dd>
                  </div>
                  <div>
                    <dt>订单</dt>
                    <dd>{resourceTotals.purchases} 笔</dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
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
          <label className={styles.inlineLabel}>
            资源
            <select
              className={styles.select}
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
            >
              <option value="all">全部资源</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.inlineLabel}>
            支付方式
            <select className={styles.select} value={currency} onChange={(event) => setCurrency(event.target.value)}>
              <option value="all">全部</option>
              <option value="diamond">钻石</option>
              <option value="emerald">绿宝石</option>
            </select>
          </label>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>模拟付费订单明细</caption>
            <thead>
              <tr>
                <th>订单号</th>
                <th>资源</th>
                <th>时间</th>
                <th>收益</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <tr key={order.id}>
                  <td className={styles.orderId}>{order.id}</td>
                  <td>{resources.find((resource) => resource.id === order.resourceId)?.name}</td>
                  <td>{order.time.slice(11)}</td>
                  <td>
                    {formatValue(order.amount)} {order.currency === "diamond" ? "钻石" : "绿宝石"}
                  </td>
                  <td className={styles.positive}>已完成</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    当前筛选下没有订单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
