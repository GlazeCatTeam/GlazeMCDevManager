import { Button, Panel, SegmentedControl, useSession } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import {
  aggregate,
  type DayRange,
  daysInRange,
  formatValue,
  isAverageMetric,
  type Metric,
  metrics,
  type Resource,
  topResources,
  trackingSeries,
} from "../data";
import { QueryContent, QuerySkeleton, QueryState, useRefresh } from "../QueryState";
import { useAnalysisSnapshot, useAnalyticsQuery } from "../useAnalyticsQuery";
import { DataTable, TableNote } from "../widgets/DataTable";
import { ResourceSelector } from "../widgets/ResourceSelector";
import { SeriesName } from "../widgets/Swatch";
import { TrendChart } from "../widgets/TrendChart";
import { chartKindOptions, dayRangeOptions, rangeText } from "./options";
import { readTrackingPreferences, saveTrackingPreferences } from "./tracking-preferences";
import styles from "./Views.module.css";

const metricOptions = metrics.map((item) => ({ value: item.id, label: item.label }));
// Give each displayed comparison its own color, shared by chips, lines and summary rows
const comparisonColors = [
  "var(--g-chart-series-1)",
  "var(--g-chart-series-2)",
  "var(--g-chart-series-3)",
  "var(--g-chart-series-4)",
  "#e88358",
  "#d876aa",
  "#40b6ae",
  "#98a84b",
  "#7f89db",
  "#b99b77",
];

/** Compare manual selections or the current metric's top ten resources over the chosen interval */
export function TrackingView({ resources, refreshVersion }: { resources: Resource[]; refreshVersion: number }) {
  const { current } = useSession();
  const initialIds = resources.slice(0, 3).map((resource) => resource.id);
  const [initial] = useState(() => readTrackingPreferences(current?.id, initialIds));
  const [resourceIds, setResourceIds] = useState<string[] | null>(initial.resourceIds);
  const [days, setDays] = useState<DayRange>(initial.days);
  const [metric, setMetric] = useState<Metric>(initial.metric);
  const [chartKind, setChartKind] = useState<"line" | "bar">(initial.chartKind);
  useEffect(() => {
    saveTrackingPreferences(current?.id, { resourceIds, days, metric, chartKind });
  }, [current?.id, resourceIds, days, metric, chartKind]);
  const top10 = resourceIds === null;
  const requestedDates = daysInRange(days);
  const requestedResources = top10 ? resources : resources.filter((resource) => resourceIds.includes(resource.id));
  const query = useAnalyticsQuery(
    "analytics.daily",
    {
      resourceIds: requestedResources.map((resource) => resource.id),
      startDate: requestedDates[0] as string,
      endDate: requestedDates.at(-1) as string,
      // The platform includes resource follower counts only with its extended PE statistics
      includePeers: metric === "favorites",
    },
    requestedResources.length > 0,
  );
  const result = useAnalysisSnapshot(
    query,
    { dates: requestedDates, resourceIds, metric },
    requestedResources.length > 0,
  );
  const { dates, resourceIds: displayedIds, metric: displayedMetric } = result.scope;
  const displayedTop10 = displayedIds === null;
  const displayedResources = displayedTop10
    ? resources
    : resources.filter((resource) => displayedIds.includes(resource.id));
  useRefresh(result.reload, refreshVersion);
  const rankedResources = displayedTop10
    ? topResources(displayedResources, result.data ?? [], dates, displayedMetric)
    : displayedResources;
  const selectedResources = rankedResources.map((resource, index) => ({
    ...resource,
    color: comparisonColors[index % comparisonColors.length] ?? resource.color,
  }));
  const selectorResources = resources.map(
    (resource) => selectedResources.find((item) => item.id === resource.id) ?? resource,
  );
  const selectedIds = selectedResources.map((resource) => resource.id);
  const records = (result.data ?? []).filter((record) => selectedIds.includes(record.resourceId));
  const series = trackingSeries(selectedResources, records, dates, displayedMetric);
  const selectedMetric = metrics.find((item) => item.id === displayedMetric);
  const unit = selectedMetric?.unit ?? "";
  const averageMetric = isAverageMetric(displayedMetric);
  const rankingBasis = averageMetric ? "区间日均" : "区间合计";

  /** Summarize daily values without adding rates, per-player time or daily active users */
  const summaryRow = (id: string, label: string, color: string, values: (number | null)[]) => {
    const total = aggregate(
      records.filter((record) => record.resourceId === id),
      displayedMetric,
    );
    const available = values.filter((value): value is number => value !== null);
    const average = available.length > 0 ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
    return (
      <tr key={id}>
        <th>
          <SeriesName color={color} name={label} />
        </th>
        {!averageMetric && <td>{formatValue(total, displayedMetric)}</td>}
        <td>{formatValue(average, displayedMetric)}</td>
        <td>{formatValue(available.length ? Math.max(...available) : null, displayedMetric)}</td>
        <td>{formatValue(available.length ? Math.min(...available) : null, displayedMetric)}</td>
      </tr>
    );
  };

  return (
    <>
      <Panel className={styles.trackingFilters} aria-label="数据追踪筛选">
        <ResourceSelector
          resources={selectorResources}
          selectedIds={top10 ? selectedIds : resourceIds}
          onChange={setResourceIds}
          actions={
            <Button
              size="sm"
              variant={top10 ? "primary" : "secondary"}
              onClick={() => setResourceIds(null)}
              disabled={resources.length === 0}
              title={`按所选时间内的${selectedMetric?.label}${rankingBasis}，从全部资源中展示前 10 名`}
            >
              Top 10
            </Button>
          }
        />
        <div className={styles.queryRow}>
          <div className={styles.dateControls}>
            <span className={styles.filterLabel}>时间</span>
            <SegmentedControl label="追踪日期范围" options={dayRangeOptions} value={days} onChange={setDays} />
            <span className={styles.dateRange}>{rangeText(requestedDates)}</span>
          </div>
          <div className={styles.queryActions}>
            <span className={styles.muted}>选择后自动更新</span>
          </div>
        </div>
      </Panel>
      <QueryState
        query={result}
        scopeLabel={`${rangeText(dates)} · ${selectedMetric?.label} · ${selectedResources.length} 个资源`}
      />
      <div className={styles.chartToolbar}>
        <SegmentedControl label="追踪指标" options={metricOptions} value={metric} onChange={setMetric} />
        <SegmentedControl label="图表类型" options={chartKindOptions} value={chartKind} onChange={setChartKind} />
      </div>
      <QuerySkeleton loading={result.loading} stats={false} />
      {requestedResources.length === 0 && (
        <Panel className={styles.trendPanel}>
          <p>选择资源开始对比，也可以点击 Top 10 查看表现最好的作品。</p>
        </Panel>
      )}
      {result.data !== null && (
        <QueryContent loading={result.loading}>
          {selectedResources.length > 0 && records.length === 0 && (
            <p role="status">
              平台返回了空列表：{rangeText(dates)}，共 {selectedResources.length} 个资源。请尝试其他资源或扩大日期范围。
            </p>
          )}
          <Panel className={styles.trendPanel} aria-label="资源数据趋势">
            {displayedTop10 && (
              <p role="status" className={styles.rankingNote}>
                Top 10 · 按{selectedMetric?.label}
                {rankingBasis}降序展示 {selectedResources.length} 个资源 · 缺失指标不参与排名
              </p>
            )}
            {displayedTop10 && series.length === 0 ? (
              <p>当前范围没有可排名的数据</p>
            ) : (
              <TrendChart labels={dates} series={series} metric={displayedMetric} unit={unit} kind={chartKind} />
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
              columns={
                averageMetric
                  ? ["资源", "有数据日均", "最高", "最低"]
                  : ["资源", "已返回数据合计", "有数据日均", "最高", "最低"]
              }
              rows={series.map((item) => summaryRow(item.id, item.label, item.color, item.values))}
              emptyText={displayedTop10 ? "当前范围没有可排名的数据" : "尚未选择资源"}
            />
            <TableNote>
              共 {series.length} 个资源 · {dates.length} 天 · 收到 {records.length} 条日记录 · 单位：{unit} ·
              平台未返回的日期或指标显示“—”，不计入日均
              {averageMetric && " · 按已返回日期取算术平均，不做跨日去重或加权"}
            </TableNote>
          </Panel>
        </QueryContent>
      )}
    </>
  );
}
