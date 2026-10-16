import { Pagination, Panel, SearchField, SegmentedControl } from "@glaze/plugin-sdk";
import { useMemo, useState } from "react";
import {
  aggregate,
  formatValue,
  type Metric,
  type MonthRange,
  monthsInRange,
  shiftDay,
  todayKey,
  topResources,
  trackingSeries,
} from "../data";
import { QuerySkeleton, QueryState, useRefresh } from "../QueryState";
import { useAnalyticsQuery } from "../useAnalyticsQuery";
import { InlineSelect } from "../widgets/InlineSelect";
import { ResourceCard, ResourceGrid } from "../widgets/ResourceCard";
import { StatStrip } from "../widgets/StatStrip";
import { TrendChart } from "../widgets/TrendChart";
import { monthRangeOptions, rangeText } from "./options";
import styles from "./Views.module.css";

const summaryMetrics: { id: Metric; label: string; unit: string }[] = [
  { id: "diamonds", label: "钻石收益", unit: "钻石" },
  { id: "emeralds", label: "绿宝石收益", unit: "绿宝石" },
  { id: "downloads", label: "组件下载", unit: "次" },
];
const metricOptions = summaryMetrics.map((item) => ({ value: item.id, label: item.label }));
const PAGE_SIZE = 12;

/** Native calendar-month totals and trends, including historical resources */
export function SummaryView({ refreshVersion }: { refreshVersion: number }) {
  const today = todayKey();
  const currentMonth = today.slice(0, 7);
  const endDate = shiftDay(today, -1);
  const [months, setMonths] = useState<MonthRange>(6);
  const [metric, setMetric] = useState<Metric>("diamonds");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [chartScope, setChartScope] = useState<"total" | "resources">("total");
  const monthKeys = monthsInRange(months);
  const activeMonth = monthKeys.includes(selectedMonth) ? selectedMonth : currentMonth;
  const result = useAnalyticsQuery("analytics.monthly", { startDate: `${monthKeys[0]}-01`, endDate });
  useRefresh(result.reload, refreshVersion);
  const records = result.data ?? [];
  const resources = useMemo(
    () =>
      [...new Map((result.data ?? []).map((row) => [row.resourceId, row.name])).entries()].map(([id, name], index) => ({
        id,
        name,
        category: "手游资源",
        color: `var(--g-chart-series-${(index % 4) + 1})`,
      })),
    [result.data],
  );
  const selectedMetric = summaryMetrics.find((item) => item.id === metric);
  const monthOptions = monthKeys
    .toReversed()
    .map((month) => ({ value: month, label: month === currentMonth ? `${month}（未完结）` : month }));
  const leaders = topResources(resources, records, monthKeys, metric);
  const matching = resources.filter((resource) =>
    resource.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  return (
    <>
      <Panel className={styles.compactFilters} aria-label="月度汇总筛选">
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>时间</span>
          <SegmentedControl label="汇总月份范围" options={monthRangeOptions} value={months} onChange={setMonths} />
          <span className={styles.dateRange}>
            {rangeText(monthKeys)} · 截至 {endDate}
          </span>
        </div>
      </Panel>
      <QueryState query={result} />
      <QuerySkeleton loading={result.loading && result.data === null} />
      {result.data !== null && (
        <>
          <StatStrip
            items={summaryMetrics.map((item) => ({
              label: item.label,
              value: formatValue(aggregate(records, item.id)),
              note: `近 ${months} 个月已返回数据 · ${item.unit}`,
            }))}
          />
          <Panel
            className={styles.trendPanel}
            title="月度趋势"
            actions={
              <SegmentedControl label="月度趋势指标" options={metricOptions} value={metric} onChange={setMetric} />
            }
          >
            <SegmentedControl
              label="月度趋势范围"
              options={[
                { value: "total", label: "全部资源合计" },
                { value: "resources", label: "资源 Top 10" },
              ]}
              value={chartScope}
              onChange={setChartScope}
            />
            {resources.length > 0 ? (
              <TrendChart
                labels={monthKeys}
                metric={metric}
                unit={selectedMetric?.unit ?? ""}
                series={
                  chartScope === "total"
                    ? [
                        {
                          id: "all",
                          label: "全部资源合计",
                          color: "var(--g-chart-series-1)",
                          values: monthKeys.map((month) =>
                            aggregate(
                              records.filter((row) => row.date === month),
                              metric,
                            ),
                          ),
                        },
                      ]
                    : trackingSeries(leaders, records, monthKeys, metric)
                }
              />
            ) : (
              <p>当前日期范围暂无月度数据</p>
            )}
          </Panel>
          <Panel
            className={styles.resourcePanel}
            title="各资源月度数据"
            actions={
              <InlineSelect label="月份" value={activeMonth} options={monthOptions} onChange={setSelectedMonth} />
            }
          >
            <div className={styles.filterRow}>
              <SearchField
                label="搜索月度资源"
                placeholder="搜索资源名称…"
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(0);
                }}
              />
              <span className={styles.muted}>共 {matching.length} 个 · 搜索不影响合计</span>
            </div>
            <ResourceGrid>
              {matching.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  caption={`${resource.category} · ${activeMonth}`}
                  metrics={summaryMetrics.map((item) => ({
                    label: item.label,
                    value: formatValue(
                      aggregate(
                        records.filter((record) => record.resourceId === resource.id && record.date === activeMonth),
                        item.id,
                      ),
                    ),
                  }))}
                />
              ))}
              {matching.length === 0 && (
                <p className={styles.muted}>{search ? "没有匹配的资源，试试其他关键词" : "当前范围暂无资源数据"}</p>
              )}
            </ResourceGrid>
            <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} note={`每页 ${PAGE_SIZE} 个资源`} />
            <span className={styles.muted}>“—”表示平台未提供。月汇总未提供购买次数合计。</span>
          </Panel>
        </>
      )}
    </>
  );
}
