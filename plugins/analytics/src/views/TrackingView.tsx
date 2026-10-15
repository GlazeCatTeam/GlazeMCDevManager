import { Button, Chip, Panel, SegmentedControl } from "@glaze/plugin-sdk";
import { useState } from "react";
import {
  aggregate,
  type DayRange,
  daysInRange,
  formatValue,
  type Metric,
  metrics,
  queryTracking,
  resources,
  trackingSeries,
} from "../mock";
import { DataTable, TableNote } from "../widgets/DataTable";
import { SeriesName, Swatch } from "../widgets/Swatch";
import { TrendChart } from "../widgets/TrendChart";
import { chartKindOptions, dayRangeOptions, rangeText } from "./options";
import styles from "./Views.module.css";

const initialIds = resources.slice(0, 3).map((resource) => resource.id);
const metricOptions = metrics.map((item) => ({ value: item.id, label: item.label }));

/** Daily comparison of several resources; filters apply only when "查询数据" is pressed */
export function TrackingView({ refreshVersion }: { refreshVersion: number }) {
  const [draftIds, setDraftIds] = useState(initialIds);
  const [draftDays, setDraftDays] = useState<DayRange>(14);
  const [query, setQuery] = useState({ resourceIds: initialIds, days: 14 as DayRange });
  const [metric, setMetric] = useState<Metric>("diamonds");
  const [chartKind, setChartKind] = useState<"line" | "bar">("line");
  const [queryVersion, setQueryVersion] = useState(0);
  const dates = daysInRange(query.days);
  const records = queryTracking(query.resourceIds, query.days);
  const series = trackingSeries(records, dates, metric);
  const selectedMetric = metrics.find((item) => item.id === metric);
  const unit = selectedMetric?.unit ?? "";
  const hasChanges = query.days !== draftDays || query.resourceIds.join() !== draftIds.join();

  /** Add or remove a resource from the pending query */
  const toggleResource = (id: string) =>
    setDraftIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  /** Apply the pending filters */
  const runQuery = () => {
    setQuery({ resourceIds: draftIds, days: draftDays });
    setQueryVersion((value) => value + 1);
  };

  /** Interval summary row of one resource */
  const summaryRow = (id: string, label: string, color: string, values: number[]) => {
    const total = aggregate(
      records.filter((record) => record.resourceId === id),
      metric,
    );
    const average =
      metric === "rating" ? values.reduce((sum, value) => sum + value, 0) / query.days : total / query.days;
    return (
      <tr key={id}>
        <th>
          <SeriesName color={color} name={label} />
        </th>
        <td>{formatValue(total, metric)}</td>
        <td>{formatValue(average, metric)}</td>
        <td>{formatValue(Math.max(...values), metric)}</td>
        <td>{formatValue(Math.min(...values), metric)}</td>
      </tr>
    );
  };

  return (
    <>
      <Panel className={styles.filters} aria-label="数据追踪筛选">
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>资源</span>
          <fieldset className={styles.chips} aria-label="选择对比资源">
            {resources.map((resource) => {
              const selected = draftIds.includes(resource.id);
              return (
                <Chip key={resource.id} selected={selected} onClick={() => toggleResource(resource.id)}>
                  <Swatch color={resource.color} />
                  {resource.name}
                  <span aria-hidden="true">{selected ? "×" : "+"}</span>
                </Chip>
              );
            })}
          </fieldset>
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <SegmentedControl label="追踪日期范围" options={dayRangeOptions} value={draftDays} onChange={setDraftDays} />
          <span className={styles.dateRange}>{rangeText(daysInRange(draftDays))}</span>
          <span className={styles.pushRight}>
            <Button size="sm" variant="primary" onClick={runQuery}>
              查询数据
            </Button>
          </span>
        </div>
      </Panel>
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
          columns={["资源", metric === "rating" ? "加权评分" : "区间合计", "日均", "最高", "最低"]}
          rows={series.map((item) => summaryRow(item.id, item.label, item.color, item.values))}
          emptyText="尚未选择资源"
        />
        <TableNote>
          {queryVersion > 0
            ? `已查询 ${series.length} 个资源的本地模拟数据`
            : `共 ${series.length} 个资源 · ${query.days} 天 · 单位：${unit}`}
        </TableNote>
      </Panel>
    </>
  );
}
