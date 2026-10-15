import { Panel, SegmentedControl } from "@glaze/plugin-sdk";
import { useState } from "react";
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
} from "../mock";
import { DataTable, positiveClass } from "../widgets/DataTable";
import { InlineSelect } from "../widgets/InlineSelect";
import { StatStrip } from "../widgets/StatStrip";
import { TrendChart } from "../widgets/TrendChart";
import { dayRangeOptions, rangeText } from "./options";
import styles from "./Views.module.css";

const moduleMetrics: Metric[] = ["downloads", "diamonds", "favorites", "rating"];
const metricOptions = metrics
  .filter((item) => moduleMetrics.includes(item.id))
  .map((item) => ({ value: item.id, label: item.label }));
const resourceOptions = resources.map((item) => ({ value: item.id, label: item.name }));

/** Label of a metric id, e.g. "组件下载" */
function metricLabel(id: Metric): string {
  return metrics.find((item) => item.id === id)?.label ?? id;
}

/** "+12.3%" lead of a value over the peer average */
function leadText(value: number, peer: number): string {
  return `${((value / peer - 1) * 100).toFixed(1)}%`;
}

/** One resource's metrics compared with a clearly labeled peer average */
export function ModuleView() {
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "forest");
  const [days, setDays] = useState<DayRange>(14);
  const [metric, setMetric] = useState<Metric>("downloads");
  const resource = resources.find((item) => item.id === resourceId) ?? resources[0];
  const records = queryTracking([resourceId], days);
  const peers = records.map(peerRecord);
  const dates = daysInRange(days);

  return (
    <>
      <Panel className={styles.filters} aria-label="模组分析筛选">
        <div className={styles.filterRow}>
          <InlineSelect label="模组" value={resourceId} options={resourceOptions} onChange={setResourceId} />
          <span className={styles.muted}>{resource?.category}</span>
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <SegmentedControl label="模组分析日期范围" options={dayRangeOptions} value={days} onChange={setDays} />
          <span className={styles.dateRange}>{rangeText(dates)}</span>
        </div>
      </Panel>
      <StatStrip
        items={moduleMetrics.map((id) => {
          const value = aggregate(records, id);
          return {
            label: metricLabel(id),
            value: formatValue(value, id),
            note: `超过同类均值 ${leadText(value, aggregate(peers, id))}`,
          };
        })}
      />
      <Panel
        className={styles.trendPanel}
        title="与同类均值对比"
        actions={<SegmentedControl label="模组趋势指标" options={metricOptions} value={metric} onChange={setMetric} />}
      >
        <TrendChart
          labels={dates}
          metric={metric}
          unit={metrics.find((item) => item.id === metric)?.unit ?? ""}
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
        <DataTable
          caption="当前模组与同类均值的指标对比"
          columns={["指标", resource?.name ?? "当前模组", "同类均值", "高于均值"]}
          emptyText="暂无指标"
          rows={moduleMetrics.map((id) => {
            const value = aggregate(records, id);
            const peer = aggregate(peers, id);
            return (
              <tr key={id}>
                <th>{metricLabel(id)}</th>
                <td>{formatValue(value, id)}</td>
                <td>{formatValue(peer, id)}</td>
                <td className={positiveClass}>+{leadText(value, peer)}</td>
              </tr>
            );
          })}
        />
      </Panel>
    </>
  );
}
