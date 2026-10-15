import { Button, Panel } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./AnalyticsPage.module.css";
import { Choices, TrendChart } from "./AnalyticsParts";
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
} from "./mock";

/** Daily resource comparison with explicit query filters and a matching interval summary */
export function TrackingView({ refreshVersion }: { refreshVersion: number }) {
  const initialIds = resources.slice(0, 3).map((resource) => resource.id);
  const [draftIds, setDraftIds] = useState(initialIds);
  const [draftDays, setDraftDays] = useState<DayRange>(14);
  const [query, setQuery] = useState({ resourceIds: initialIds, days: 14 as DayRange });
  const [metric, setMetric] = useState<Metric>("diamonds");
  const [chartKind, setChartKind] = useState<"line" | "bar">("line");
  const [queryVersion, setQueryVersion] = useState(0);
  const dates = daysInRange(query.days);
  const records = queryTracking(query.resourceIds, query.days);
  const series = trackingSeries(records, dates, metric);
  const selectedMetric = metrics.find((item) => item.id === metric) ?? metrics[2];
  const hasChanges = query.days !== draftDays || query.resourceIds.join() !== draftIds.join();

  /** Toggle selected resources without making an empty selection look like zero data */
  function toggleResource(id: string) {
    setDraftIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  /** Apply the current filters to the local preview dataset */
  function runQuery() {
    setQuery({ resourceIds: draftIds, days: draftDays });
    setQueryVersion((value) => value + 1);
  }

  return (
    <>
      <Panel className={styles.filters} aria-label="数据追踪筛选">
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>资源</span>
          <fieldset className={styles.resourceChoices} aria-label="选择对比资源">
            {resources.map((resource) => (
              <Button
                key={resource.id}
                size="xs"
                aria-pressed={draftIds.includes(resource.id)}
                onClick={() => toggleResource(resource.id)}
                className={draftIds.includes(resource.id) ? styles.resourceSelected : undefined}
              >
                <span className={styles.swatch} style={{ color: resource.color }} />
                {resource.name}
                <span aria-hidden="true">{draftIds.includes(resource.id) ? "×" : "+"}</span>
              </Button>
            ))}
          </fieldset>
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <Choices
            label="追踪日期范围"
            options={[7, 14, 30].map((value) => ({ value: value as DayRange, label: `近 ${value} 天` }))}
            value={draftDays}
            onChange={setDraftDays}
          />
          <span className={styles.dateRange}>
            {daysInRange(draftDays)[0]} — {daysInRange(draftDays).at(-1)}
          </span>
          <Button size="sm" variant="primary" className={styles.queryButton} onClick={runQuery}>
            查询数据
          </Button>
        </div>
      </Panel>
      <Panel className={styles.trendPanel} aria-label="资源数据趋势">
        <div className={styles.chartToolbar}>
          <Choices
            label="追踪指标"
            options={metrics.map((item) => ({ value: item.id, label: item.label }))}
            value={metric}
            onChange={setMetric}
          />
          <Choices
            label="图表类型"
            options={[
              { value: "line", label: "折线" },
              { value: "bar", label: "柱状" },
            ]}
            value={chartKind}
            onChange={setChartKind}
          />
        </div>
        <TrendChart
          key={`${refreshVersion}-${queryVersion}`}
          labels={dates}
          series={series}
          metric={metric}
          unit={selectedMetric?.unit ?? ""}
          kind={chartKind}
        />
      </Panel>
      <Panel
        className={styles.tablePanel}
        title="区间汇总"
        actions={
          <span className={styles.muted} aria-live="polite">
            {hasChanges ? "筛选已变更，点击查询数据应用" : `${dates[0]} — ${dates.at(-1)}`}
          </span>
        }
      >
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{selectedMetric?.label}区间汇总</caption>
            <thead>
              <tr>
                <th>资源</th>
                <th>{metric === "rating" ? "加权评分" : "区间合计"}</th>
                <th>日均</th>
                <th>最高</th>
                <th>最低</th>
              </tr>
            </thead>
            <tbody>
              {series.map((item) => {
                const resourceRecords = records.filter((record) => record.resourceId === item.id);
                const total = aggregate(resourceRecords, metric);
                const average =
                  metric === "rating"
                    ? item.values.reduce((sum, value) => sum + value, 0) / query.days
                    : total / query.days;
                return (
                  <tr key={item.id}>
                    <th>
                      <span className={styles.resourceName}>
                        <span className={styles.swatch} style={{ color: item.color }} />
                        {item.label}
                      </span>
                    </th>
                    <td>{formatValue(total, metric)}</td>
                    <td>{formatValue(average, metric)}</td>
                    <td>{formatValue(Math.max(...item.values), metric)}</td>
                    <td>{formatValue(Math.min(...item.values), metric)}</td>
                  </tr>
                );
              })}
              {series.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    尚未选择资源
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <span className={styles.tableNote} role="status">
          {queryVersion > 0
            ? `已查询 ${series.length} 个资源的本地模拟数据`
            : `共 ${series.length} 个资源 · ${query.days} 天 · 单位：${selectedMetric?.unit}`}
        </span>
      </Panel>
    </>
  );
}
