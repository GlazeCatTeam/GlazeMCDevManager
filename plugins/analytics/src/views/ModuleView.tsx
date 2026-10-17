import { Notice, Panel, SegmentedControl } from "@glaze/plugin-sdk";
import {
  aggregate,
  type DayRange,
  datesBetween,
  daysInRange,
  formatValue,
  type Metric,
  metrics,
  type Resource,
  trackingSeries,
} from "../data";
import { QuerySkeleton, QueryState, useRefresh } from "../QueryState";
import { useAnalysisPreference } from "../useAnalysisPreference";
import { useAnalysisSnapshot, useAnalyticsQuery } from "../useAnalyticsQuery";
import { DataTable } from "../widgets/DataTable";
import { DateRangePicker } from "../widgets/DateRangePicker";
import { SearchableSelect } from "../widgets/SearchableSelect";
import { StatStrip } from "../widgets/StatStrip";
import { TrendChart } from "../widgets/TrendChart";
import { dayRangeOptions, rangeText } from "./options";
import styles from "./Views.module.css";

const moduleMetrics: Metric[] = ["purchases", "diamonds"];
const metricOptions = metrics
  .filter((item) => moduleMetrics.includes(item.id))
  .map((item) => ({ value: item.id, label: item.label }));

/** Label a platform metric */
function metricLabel(id: Metric): string {
  return metrics.find((item) => item.id === id)?.label ?? id;
}

/** Signed difference against an available, nonzero peer value */
function leadText(value: number | null, peer: number | null): string {
  if (value === null || peer === null || peer === 0) return "—";
  const percent = (value / peer - 1) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

/** Compare the selected resource with peers, honoring a work link before saved preferences */
export function ModuleView({
  resources,
  refreshVersion,
  initialResourceId,
}: {
  resources: Resource[];
  refreshVersion: number;
  initialResourceId?: string | undefined;
}) {
  const [resourceId, setResourceId] = useAnalysisPreference(
    "module.resource",
    resources[0]?.id ?? "",
    undefined,
    initialResourceId,
  );
  const [days, setDays] = useAnalysisPreference<DayRange>("module.days", 14, [7, 14, 30]);
  const [customRange, setCustomRange] = useAnalysisPreference<string>("module.range", "");
  const [metric, setMetric] = useAnalysisPreference<Metric>("module.metric", "purchases", moduleMetrics);
  const requestedResource =
    resources.find((item) => item.id === resourceId) ?? (initialResourceId === resourceId ? undefined : resources[0]);
  const [customStart = "", customEnd = ""] = customRange.split(":");
  const customDates = datesBetween(customStart, customEnd);
  const custom = customDates.length > 0;
  const requestedDates = custom ? customDates : daysInRange(days);
  const query = useAnalyticsQuery(
    "analytics.daily",
    {
      includePeers: true,
      resourceIds: requestedResource ? [requestedResource.id] : [],
      startDate: requestedDates[0] as string,
      endDate: requestedDates.at(-1) as string,
    },
    !!requestedResource,
  );
  const result = useAnalysisSnapshot(
    query,
    { resource: requestedResource, dates: requestedDates },
    !!requestedResource,
  );
  const { resource, dates } = result.scope;
  useRefresh(result.reload, refreshVersion);
  const records = result.data ?? [];
  const peers = records.map((row) => ({ ...row, ...row.peers }));

  /** Compare daily averages without estimating missing peer fields */
  const averages = (id: Metric) => {
    const ownRows = records.filter((row) => row[id] !== null);
    const peerRows = peers.filter((row) => row[id] !== null);
    const total = aggregate(ownRows, id);
    const peer = aggregate(peerRows, id);
    return {
      value: total === null ? null : total / (id === "rating" ? 1 : ownRows.length),
      peer: peer === null ? null : peer / (id === "rating" ? 1 : peerRows.length),
    };
  };

  return (
    <>
      <Panel className={styles.filters} aria-label="模组分析筛选">
        <div className={styles.filterRow}>
          <SearchableSelect
            label="模组"
            value={requestedResource?.id ?? ""}
            options={resources.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setResourceId}
          />
          <span className={styles.muted}>{requestedResource?.category}</span>
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <SegmentedControl<DayRange | "custom">
            label="模组分析日期范围"
            options={dayRangeOptions}
            value={custom ? "custom" : days}
            onChange={(next) => {
              if (next === "custom") return;
              setDays(next);
              setCustomRange("");
            }}
          />
          <DateRangePicker
            dates={requestedDates}
            active={custom}
            onChange={(start, end) => setCustomRange(`${start}:${end}`)}
          />
          <span className={styles.dateRange}>{rangeText(requestedDates)}</span>
        </div>
      </Panel>
      {!requestedResource && (
        <Notice>所选作品暂无可分析的数据，仅支持曾上架且不是前置模组的手游作品。请选择其他模组。</Notice>
      )}
      <QueryState query={result} scopeLabel={`${resource?.name} · ${rangeText(dates)}`} />
      <QuerySkeleton loading={result.loading && result.data === null} />
      {result.data !== null && (
        <>
          <StatStrip
            items={moduleMetrics.map((id) => {
              const values = averages(id);
              return {
                label: `${metricLabel(id)}日均`,
                value: formatValue(values.value, id),
                note: `较同类均值 ${leadText(values.value, values.peer)}`,
              };
            })}
          />
          <Panel
            className={styles.trendPanel}
            title="与同类均值对比"
            actions={
              <SegmentedControl label="模组趋势指标" options={metricOptions} value={metric} onChange={setMetric} />
            }
          >
            <TrendChart
              labels={dates}
              metric={metric}
              unit={metrics.find((item) => item.id === metric)?.unit ?? ""}
              series={
                resource
                  ? [
                      ...trackingSeries([resource], records, dates, metric),
                      ...trackingSeries([resource], peers, dates, metric).map((series) => ({
                        ...series,
                        id: "peer",
                        label: "同类均值",
                        color: "var(--g-text-muted)",
                        dashed: true,
                      })),
                    ]
                  : []
              }
            />
          </Panel>
          <Panel
            className={styles.tablePanel}
            title="指标对比"
            actions={<span className={styles.muted}>{rangeText(dates)} · 平台已返回日期的日均值</span>}
          >
            <DataTable
              caption="当前模组与平台同类均值的指标对比"
              columns={["指标", resource?.name ?? "当前模组", "同类均值", "较同类均值"]}
              emptyText="暂无指标"
              rows={moduleMetrics.map((id) => {
                const values = averages(id);
                return (
                  <tr key={id}>
                    <th>{metricLabel(id)}</th>
                    <td>{formatValue(values.value, id)}</td>
                    <td>{formatValue(values.peer, id)}</td>
                    <td>{leadText(values.value, values.peer)}</td>
                  </tr>
                );
              })}
            />
            <span className={styles.muted}>按有该指标的日期计算日均，缺失值不计为 0；“—”表示未提供或无法比较。</span>
          </Panel>
        </>
      )}
    </>
  );
}
