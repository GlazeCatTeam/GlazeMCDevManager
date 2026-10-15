import { Panel } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./AnalyticsPage.module.css";
import { Choices, StatStrip, TrendChart } from "./AnalyticsParts";
import {
  aggregate,
  type DayRange,
  daysInRange,
  formatValue,
  type Metric,
  metrics,
  peerRecord,
  queryTracking,
  resources,
} from "./mock";

const moduleMetrics: Metric[] = ["downloads", "diamonds", "favorites", "rating"];

/** Single-resource metrics and a clearly labeled peer-average comparison */
export function ModuleView() {
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "forest");
  const [days, setDays] = useState<DayRange>(14);
  const [metric, setMetric] = useState<Metric>("downloads");
  const resource = resources.find((item) => item.id === resourceId) ?? resources[0];
  const records = queryTracking([resourceId], days);
  const peers = records.map(peerRecord);
  const selectedMetric = metrics.find((item) => item.id === metric);
  const dates = daysInRange(days);

  return (
    <>
      <Panel className={styles.filters} aria-label="模组分析筛选">
        <div className={styles.filterRow}>
          <label className={styles.filterLabel} htmlFor="analytics-module">
            模组
          </label>
          <select
            id="analytics-module"
            className={styles.select}
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
          >
            {resources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span className={styles.muted}>{resource?.category}</span>
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <Choices
            label="模组分析日期范围"
            options={[7, 14, 30].map((value) => ({ value: value as DayRange, label: `近 ${value} 天` }))}
            value={days}
            onChange={setDays}
          />
          <span className={styles.dateRange}>
            {dates[0]} — {dates.at(-1)}
          </span>
        </div>
      </Panel>
      <StatStrip
        items={moduleMetrics.map((id) => {
          const value = aggregate(records, id);
          const peer = aggregate(peers, id);
          return {
            label: metrics.find((item) => item.id === id)?.label ?? id,
            value: formatValue(value, id),
            note: `超过同类均值 ${((value / peer - 1) * 100).toFixed(1)}%`,
          };
        })}
      />
      <Panel
        className={styles.trendPanel}
        title="与同类均值对比"
        actions={
          <Choices
            label="模组趋势指标"
            options={metrics
              .filter((item) => moduleMetrics.includes(item.id))
              .map((item) => ({ value: item.id, label: item.label }))}
            value={metric}
            onChange={setMetric}
          />
        }
      >
        <TrendChart
          labels={dates}
          metric={metric}
          unit={selectedMetric?.unit ?? ""}
          series={[
            {
              id: resourceId,
              label: resource?.name ?? "当前模组",
              color: resource?.color ?? "var(--g-chart-series-1)",
              values: records.map((record) => record[metric]),
            },
            {
              id: "peer",
              label: "同类均值",
              color: "var(--g-text-muted)",
              values: peers.map((record) => record[metric]),
              dashed: true,
            },
          ]}
        />
      </Panel>
      <Panel
        className={styles.tablePanel}
        title="指标对比"
        actions={<span className={styles.muted}>近 {days} 天 · 同类样本为模拟数据</span>}
      >
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>当前模组与同类均值的指标对比</caption>
            <thead>
              <tr>
                <th>指标</th>
                <th>{resource?.name}</th>
                <th>同类均值</th>
                <th>高于均值</th>
              </tr>
            </thead>
            <tbody>
              {moduleMetrics.map((id) => {
                const value = aggregate(records, id);
                const peer = aggregate(peers, id);
                return (
                  <tr key={id}>
                    <th>{metrics.find((item) => item.id === id)?.label}</th>
                    <td>{formatValue(value, id)}</td>
                    <td>{formatValue(peer, id)}</td>
                    <td className={styles.positive}>+{((value / peer - 1) * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
