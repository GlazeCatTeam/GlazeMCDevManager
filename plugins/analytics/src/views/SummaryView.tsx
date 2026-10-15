import { Panel, SegmentedControl } from "@glaze/plugin-sdk";
import { useState } from "react";
import { aggregate, formatValue, type Metric, type MonthRange, monthsInRange, queryMonth, resources } from "../mock";
import { InlineSelect } from "../widgets/InlineSelect";
import { ResourceCard, ResourceGrid } from "../widgets/ResourceCard";
import { StatStrip } from "../widgets/StatStrip";
import { TrendChart } from "../widgets/TrendChart";
import { monthRangeOptions, rangeText } from "./options";
import styles from "./Views.module.css";

const CURRENT_MONTH = "2026-10";
const summaryMetrics: { id: Metric; label: string; unit: string }[] = [
  { id: "diamonds", label: "钻石收益", unit: "钻石" },
  { id: "emeralds", label: "绿宝石收益", unit: "绿宝石" },
  { id: "downloads", label: "组件下载", unit: "次" },
  { id: "purchases", label: "付费次数", unit: "笔" },
];
const metricOptions = summaryMetrics.map((item) => ({ value: item.id, label: item.label }));
const resourceIds = resources.map((resource) => resource.id);

/** Monthly totals, a monthly trend and per-resource cards, all from the same completed-day records */
export function SummaryView() {
  const [months, setMonths] = useState<MonthRange>(6);
  const [metric, setMetric] = useState<Metric>("diamonds");
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const monthKeys = monthsInRange(months);
  const activeMonth = monthKeys.includes(selectedMonth) ? selectedMonth : CURRENT_MONTH;
  const monthlyRecords = monthKeys.map((month) => ({ month, records: queryMonth(month, resourceIds) }));
  const allRecords = monthlyRecords.flatMap((entry) => entry.records);
  const cardRecords = queryMonth(activeMonth, resourceIds);
  const selectedMetric = summaryMetrics.find((item) => item.id === metric);
  const monthOptions = monthKeys.toReversed().map((month) => ({
    value: month,
    label: month === CURRENT_MONTH ? `${month}（截至 14 日）` : month,
  }));

  return (
    <>
      <Panel className={styles.compactFilters} aria-label="月度汇总筛选">
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <SegmentedControl label="汇总月份范围" options={monthRangeOptions} value={months} onChange={setMonths} />
          <span className={styles.dateRange}>{rangeText(monthKeys)} · 本月截至 10/14</span>
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
        actions={<SegmentedControl label="月度趋势指标" options={metricOptions} value={metric} onChange={setMetric} />}
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
        actions={<InlineSelect label="月份" value={activeMonth} options={monthOptions} onChange={setSelectedMonth} />}
      >
        <ResourceGrid>
          {resources.map((resource) => {
            const records = cardRecords.filter((record) => record.resourceId === resource.id);
            return (
              <ResourceCard
                key={resource.id}
                resource={resource}
                caption={`${resource.category} · ${activeMonth}`}
                metrics={summaryMetrics.map((item) => ({
                  label: item.label,
                  value: formatValue(aggregate(records, item.id)),
                }))}
              />
            );
          })}
        </ResourceGrid>
      </Panel>
    </>
  );
}
