import { Button, Panel, SegmentedControl } from "@glaze/plugin-sdk";
import { useState } from "react";
import {
  aggregate,
  type DayRange,
  daysInRange,
  formatValue,
  type Metric,
  metrics,
  type Resource,
  trackingSeries,
} from "../data";
import { QueryState, useRefresh } from "../QueryState";
import { useAnalyticsQuery } from "../useAnalyticsQuery";
import { DataTable, TableNote } from "../widgets/DataTable";
import { ResourceSelector } from "../widgets/ResourceSelector";
import { SeriesName } from "../widgets/Swatch";
import { TrendChart } from "../widgets/TrendChart";
import { chartKindOptions, dayRangeOptions, rangeText } from "./options";
import styles from "./Views.module.css";

const metricOptions = metrics.map((item) => ({ value: item.id, label: item.label }));

/** Daily comparison of several resources; filters apply only when "查询数据" is pressed */
export function TrackingView({ resources, refreshVersion }: { resources: Resource[]; refreshVersion: number }) {
  const initialIds = resources.slice(0, 3).map((resource) => resource.id);
  const [draftIds, setDraftIds] = useState(initialIds);
  const [draftDays, setDraftDays] = useState<DayRange>(14);
  const [query, setQuery] = useState({ resourceIds: initialIds, days: 14 as DayRange });
  const [metric, setMetric] = useState<Metric>("purchases");
  const [chartKind, setChartKind] = useState<"line" | "bar">("line");
  const [queryVersion, setQueryVersion] = useState(0);
  const dates = daysInRange(query.days);
  const selectedResources = resources.filter((resource) => query.resourceIds.includes(resource.id));
  const result = useAnalyticsQuery("analytics.daily", {
    resourceIds: selectedResources.map((resource) => resource.id),
    startDate: dates[0] as string,
    endDate: dates.at(-1) as string,
  });
  useRefresh(result.reload, refreshVersion);
  const records = result.data ?? [];
  const series = trackingSeries(selectedResources, records, dates, metric);
  const selectedMetric = metrics.find((item) => item.id === metric);
  const unit = selectedMetric?.unit ?? "";
  const hasChanges = query.days !== draftDays || query.resourceIds.join() !== draftIds.join();

  /** Apply the pending filters */
  const runQuery = () => {
    setQuery({ resourceIds: draftIds, days: draftDays });
    setQueryVersion((value) => value + 1);
    if (!hasChanges) result.reload();
  };

  /** Interval summary row of one resource */
  const summaryRow = (id: string, label: string, color: string, values: (number | null)[]) => {
    const total = aggregate(
      records.filter((record) => record.resourceId === id),
      metric,
    );
    const available = values.filter((value): value is number => value !== null);
    const average = available.length > 0 ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
    return (
      <tr key={id}>
        <th>
          <SeriesName color={color} name={label} />
        </th>
        <td>{formatValue(total, metric)}</td>
        <td>{formatValue(average, metric)}</td>
        <td>{formatValue(available.length ? Math.max(...available) : null, metric)}</td>
        <td>{formatValue(available.length ? Math.min(...available) : null, metric)}</td>
      </tr>
    );
  };

  return (
    <>
      <Panel className={styles.trackingFilters} aria-label="数据追踪筛选">
        <ResourceSelector resources={resources} selectedIds={draftIds} onChange={setDraftIds} />
        <div className={styles.queryRow}>
          <div className={styles.dateControls}>
            <span className={styles.filterLabel}>时间</span>
            <SegmentedControl
              label="追踪日期范围"
              options={dayRangeOptions}
              value={draftDays}
              onChange={setDraftDays}
            />
            <span className={styles.dateRange}>{rangeText(daysInRange(draftDays))}</span>
          </div>
          <div className={styles.queryActions}>
            <span className={styles.muted} role="status">
              {hasChanges ? "筛选已修改，等待查询" : ""}
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={runQuery}
              disabled={!resources.some((resource) => draftIds.includes(resource.id)) || result.loading}
            >
              查询数据
            </Button>
          </div>
        </div>
      </Panel>
      <QueryState query={result} />
      {result.data !== null && !result.error && (
        <>
          {selectedResources.length > 0 && records.length === 0 && (
            <p role="status">
              平台返回了空列表：{rangeText(dates)}，共 {selectedResources.length} 个资源。请尝试其他资源或扩大日期范围。
            </p>
          )}
          <Panel className={styles.trendPanel} aria-label="资源数据趋势">
            <div className={styles.chartToolbar}>
              <SegmentedControl label="追踪指标" options={metricOptions} value={metric} onChange={setMetric} />
              <SegmentedControl label="图表类型" options={chartKindOptions} value={chartKind} onChange={setChartKind} />
            </div>
            <TrendChart
              key={`${refreshVersion}-${queryVersion}`}
              labels={dates}
              series={series}
              metric={metric}
              unit={unit}
              kind={chartKind}
            />
          </Panel>
          <Panel
            className={styles.tablePanel}
            title="区间汇总"
            actions={
              <span className={styles.muted} aria-live="polite">
                {hasChanges ? "筛选已变更，点击查询数据应用" : rangeText(dates)}
              </span>
            }
          >
            <DataTable
              caption={`${selectedMetric?.label}区间汇总`}
              columns={["资源", metric === "rating" ? "日评分均值" : "已返回数据合计", "有数据日均", "最高", "最低"]}
              rows={series.map((item) => summaryRow(item.id, item.label, item.color, item.values))}
              emptyText="尚未选择资源"
            />
            <TableNote>
              共 {series.length} 个资源 · {query.days} 天 · 收到 {records.length} 条日记录 · 单位：{unit} ·
              平台未返回的日期或指标显示“—”，不计入日均
            </TableNote>
          </Panel>
        </>
      )}
    </>
  );
}
