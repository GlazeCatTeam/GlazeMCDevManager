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
  topResources,
  trackingSeries,
} from "../data";
import { QuerySkeleton, QueryState, useRefresh } from "../QueryState";
import { useAnalyticsQuery } from "../useAnalyticsQuery";
import { DataTable, TableNote } from "../widgets/DataTable";
import { ResourceSelector } from "../widgets/ResourceSelector";
import { SeriesName } from "../widgets/Swatch";
import { TrendChart } from "../widgets/TrendChart";
import { chartKindOptions, dayRangeOptions, rangeText } from "./options";
import styles from "./Views.module.css";

const metricOptions = metrics.map((item) => ({ value: item.id, label: item.label }));

/** Compare manual selections or the current metric's top ten resources over the chosen interval */
export function TrackingView({ resources, refreshVersion }: { resources: Resource[]; refreshVersion: number }) {
  const initialIds = resources.slice(0, 3).map((resource) => resource.id);
  const [resourceIds, setResourceIds] = useState<string[] | null>(initialIds);
  const [days, setDays] = useState<DayRange>(14);
  const [metric, setMetric] = useState<Metric>("purchases");
  const [chartKind, setChartKind] = useState<"line" | "bar">("line");
  const top10 = resourceIds === null;
  const dates = daysInRange(days);
  const requestedResources = top10 ? resources : resources.filter((resource) => resourceIds.includes(resource.id));
  const result = useAnalyticsQuery(
    "analytics.daily",
    {
      resourceIds: requestedResources.map((resource) => resource.id),
      startDate: dates[0] as string,
      endDate: dates.at(-1) as string,
    },
    requestedResources.length > 0,
  );
  useRefresh(result.reload, refreshVersion);
  const selectedResources = top10
    ? topResources(requestedResources, result.data ?? [], dates, metric)
    : requestedResources;
  const selectedIds = selectedResources.map((resource) => resource.id);
  const records = (result.data ?? []).filter((record) => selectedIds.includes(record.resourceId));
  const series = trackingSeries(selectedResources, records, dates, metric);
  const selectedMetric = metrics.find((item) => item.id === metric);
  const unit = selectedMetric?.unit ?? "";

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
        <ResourceSelector
          resources={resources}
          selectedIds={selectedIds}
          onChange={setResourceIds}
          actions={
            <Button
              size="sm"
              variant={top10 ? "primary" : "secondary"}
              onClick={() => setResourceIds(null)}
              disabled={resources.length === 0}
              title={`按所选时间内的${selectedMetric?.label}合计，从全部资源中展示前 10 名`}
            >
              Top 10
            </Button>
          }
        />
        <div className={styles.queryRow}>
          <div className={styles.dateControls}>
            <span className={styles.filterLabel}>时间</span>
            <SegmentedControl label="追踪日期范围" options={dayRangeOptions} value={days} onChange={setDays} />
            <span className={styles.dateRange}>{rangeText(dates)}</span>
          </div>
          <div className={styles.queryActions}>
            <span className={styles.muted}>选择后自动更新</span>
          </div>
        </div>
      </Panel>
      <QueryState query={result} />
      <QuerySkeleton loading={result.loading && result.data === null} stats={false} />
      {requestedResources.length === 0 && (
        <Panel className={styles.trendPanel}>
          <p>选择资源开始对比，也可以点击 Top 10 查看表现最好的作品。</p>
        </Panel>
      )}
      {result.data !== null && (
        <>
          {top10 && (
            <p role="status">
              Top 10 · 按{selectedMetric?.label}区间合计降序展示 {selectedResources.length}{" "}
              个资源，切换指标自动更新排名。
              {selectedResources.length === 0 ? "当前范围没有可排名的数据。" : "缺失指标不参与排名。"}
            </p>
          )}
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
            {top10 && series.length === 0 ? (
              <p>当前范围没有可排名的数据</p>
            ) : (
              <TrendChart labels={dates} series={series} metric={metric} unit={unit} kind={chartKind} />
            )}
          </Panel>
          <Panel
            className={styles.tablePanel}
            title="区间汇总"
            actions={
              <span className={styles.muted} aria-live="polite">
                {rangeText(dates)}
              </span>
            }
          >
            <DataTable
              caption={`${selectedMetric?.label}区间汇总`}
              columns={["资源", metric === "rating" ? "日评分均值" : "已返回数据合计", "有数据日均", "最高", "最低"]}
              rows={series.map((item) => summaryRow(item.id, item.label, item.color, item.values))}
              emptyText={top10 ? "当前范围没有可排名的数据" : "尚未选择资源"}
            />
            <TableNote>
              共 {series.length} 个资源 · {days} 天 · 收到 {records.length} 条日记录 · 单位：{unit} ·
              平台未返回的日期或指标显示“—”，不计入日均
            </TableNote>
          </Panel>
        </>
      )}
    </>
  );
}
