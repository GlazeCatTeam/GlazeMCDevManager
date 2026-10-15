import { Panel } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./AnalyticsPage.module.css";
import { Choices, StatStrip, TrendChart } from "./AnalyticsParts";
import { aggregate, formatValue, type Metric, type MonthRange, monthsInRange, queryMonth, resources } from "./mock";

const summaryMetrics: { id: Metric; label: string; unit: string }[] = [
  { id: "diamonds", label: "钻石收益", unit: "钻石" },
  { id: "emeralds", label: "绿宝石收益", unit: "绿宝石" },
  { id: "downloads", label: "组件下载", unit: "次" },
  { id: "purchases", label: "付费次数", unit: "笔" },
];

/** Monthly totals and per-resource cards drawn from the same completed-day records */
export function SummaryView() {
  const [months, setMonths] = useState<MonthRange>(6);
  const [metric, setMetric] = useState<Metric>("diamonds");
  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const monthKeys = monthsInRange(months);
  const activeMonth = monthKeys.includes(selectedMonth) ? selectedMonth : "2026-10";
  const resourceIds = resources.map((resource) => resource.id);
  const monthlyRecords = monthKeys.map((month) => ({ month, records: queryMonth(month, resourceIds) }));
  const allRecords = monthlyRecords.flatMap((entry) => entry.records);
  const cardRecords = queryMonth(activeMonth, resourceIds);
  const selectedMetric = summaryMetrics.find((item) => item.id === metric) ?? summaryMetrics[0];

  return (
    <>
      <Panel className={styles.compactFilters} aria-label="月度汇总筛选">
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <Choices
            label="汇总月份范围"
            options={[3, 6, 12].map((value) => ({ value: value as MonthRange, label: `近 ${value} 个月` }))}
            value={months}
            onChange={setMonths}
          />
          <span className={styles.dateRange}>
            {monthKeys[0]} — {monthKeys.at(-1)} · 本月截至 10/14
          </span>
        </div>
      </Panel>
      <StatStrip
        items={summaryMetrics.map((item) => ({
          label: item.label,
          value: formatValue(aggregate(allRecords, item.id)),
          note: `近 ${months} 个月 · ${item.unit}`,
        }))}
      />
      <Panel
        className={styles.trendPanel}
        title="月度趋势"
        actions={
          <Choices
            label="月度趋势指标"
            options={summaryMetrics.map((item) => ({ value: item.id, label: item.label }))}
            value={metric}
            onChange={setMetric}
          />
        }
      >
        <TrendChart
          labels={monthKeys}
          metric={metric}
          unit={selectedMetric?.unit ?? ""}
          series={resources.map((resource) => ({
            id: resource.id,
            label: resource.name,
            color: resource.color,
            values: monthlyRecords.map((entry) =>
              aggregate(
                entry.records.filter((record) => record.resourceId === resource.id),
                metric,
              ),
            ),
          }))}
        />
      </Panel>
      <Panel
        className={styles.resourcePanel}
        title="各资源月度数据"
        actions={
          <label className={styles.inlineLabel}>
            月份
            <select
              className={styles.select}
              value={activeMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              aria-label="资源卡片月份"
            >
              {monthKeys.toReversed().map((month) => (
                <option key={month} value={month}>
                  {month}
                  {month === "2026-10" ? "（截至 14 日）" : ""}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className={styles.resourceGrid}>
          {resources.map((resource) => {
            const records = cardRecords.filter((record) => record.resourceId === resource.id);
            return (
              <div className={styles.resourceCard} key={resource.id}>
                <strong className={styles.resourceName}>
                  <span className={styles.swatch} style={{ color: resource.color }} />
                  {resource.name}
                </strong>
                <span className={styles.muted}>
                  {resource.category} · {activeMonth}
                </span>
                <dl className={styles.cardMetrics}>
                  {summaryMetrics.map((item) => (
                    <div key={item.id}>
                      <dt>{item.label}</dt>
                      <dd>{formatValue(aggregate(records, item.id))}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
