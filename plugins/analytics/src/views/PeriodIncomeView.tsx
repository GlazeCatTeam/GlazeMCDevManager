import {
  Button,
  type IncomePlatform,
  Pagination,
  Panel,
  SearchField,
  SegmentedControl,
  TextButton,
} from "@glaze/plugin-sdk";
import { useMemo, useState } from "react";
import { formatValue, type Resource, todayKey, workResources } from "../data";
import {
  type IncomeMetric,
  incomeCycle,
  incomeMetrics,
  periodIncomeYuan,
  summarizePeriodIncome,
} from "../period-income";
import { QueryState, useRefresh } from "../QueryState";
import { useAnalyticsQuery } from "../useAnalyticsQuery";
import { DataTable, TableNote } from "../widgets/DataTable";
import { InlineSelect } from "../widgets/InlineSelect";
import { MinecraftCurrencyIcon } from "../widgets/MinecraftCurrencyIcon";
import { SearchableSelect } from "../widgets/SearchableSelect";
import { StatStrip } from "../widgets/StatStrip";
import { Swatch } from "../widgets/Swatch";
import { TrendChart } from "../widgets/TrendChart";
import styles from "./PeriodIncomeView.module.css";

const PAGE_SIZE = 10;
const metricOptions = incomeMetrics.map(({ id, label }) => ({ value: id, label }));

/** Switch platform before selecting resources so neither selections nor results can cross platforms */
export function PeriodIncomeView({ refreshVersion }: { refreshVersion: number }) {
  const [platform, setPlatform] = useState<IncomePlatform>("pe");
  return (
    <>
      <Panel className={styles.filters} aria-label="周期收益平台">
        <SegmentedControl
          label="收益平台"
          value={platform}
          options={[
            { value: "pe", label: "PE · 手游" },
            { value: "pc", label: "PC · 电脑版" },
          ]}
          onChange={setPlatform}
        />
        <span className={styles.muted}>各平台独立查询和统计</span>
      </Panel>
      <PlatformPeriodIncome key={platform} platform={platform} refreshVersion={refreshVersion} />
    </>
  );
}

/** Load the selected platform's own resource list; never infer PC resources from PE sync flags */
function PlatformPeriodIncome({ platform, refreshVersion }: { platform: IncomePlatform; refreshVersion: number }) {
  const works = useAnalyticsQuery("works.list", platform === "pc" ? { platform } : undefined);
  useRefresh(works.reload, refreshVersion);
  const resources = workResources(works.data ?? [], platform);
  return (
    <>
      <QueryState query={works} />
      {works.data &&
        !works.error &&
        (resources.length ? (
          <PeriodIncomeScope platform={platform} resources={resources} refreshVersion={refreshVersion} />
        ) : (
          <Panel title={`${platform.toUpperCase()} 周期收益`}>
            <p>当前平台暂无曾上架且可分析的资源。</p>
          </Panel>
        ))}
    </>
  );
}

/** Select a fixed monthly cycle and resource scope within one platform */
function PeriodIncomeScope({
  resources,
  refreshVersion,
  platform,
}: {
  resources: Resource[];
  refreshVersion: number;
  platform: IncomePlatform;
}) {
  const today = todayKey();
  const [draftOffset, setDraftOffset] = useState(0);
  const [draftResource, setDraftResource] = useState("all");
  const [query, setQuery] = useState({ offset: 0, resourceId: "all", version: 0 });
  const cycle = incomeCycle(query.offset, today);
  const draftCycle = incomeCycle(draftOffset, today);
  const selectedResources = resources.filter(
    (resource) => query.resourceId === "all" || resource.id === query.resourceId,
  );
  const changed = draftOffset !== query.offset || draftResource !== query.resourceId;
  const cycleOptions = Array.from({ length: 12 }, (_, index) => {
    const item = incomeCycle(-index, today);
    return { value: String(-index), label: `${item.startDate} — ${item.endDate}${index === 0 ? "（当前周期）" : ""}` };
  });

  return (
    <>
      <Panel className={styles.filters} aria-label="周期收益筛选">
        <div className={styles.heading}>
          <strong>{platform.toUpperCase()} · 每月 22 日至下月 22 日（两端计入）</strong>
          <span className={styles.muted}>北京时间 · 不含当天未完结数据</span>
        </div>
        <div className={styles.controls}>
          <Button size="sm" disabled={draftOffset === -11} onClick={() => setDraftOffset((value) => value - 1)}>
            上一周期
          </Button>
          <InlineSelect
            label="收益周期"
            value={String(draftOffset)}
            options={cycleOptions}
            onChange={(value) => setDraftOffset(Number(value))}
          />
          <Button size="sm" disabled={draftOffset === 0} onClick={() => setDraftOffset((value) => value + 1)}>
            下一周期
          </Button>
          {draftOffset !== 0 && (
            <TextButton tone="subtle" onClick={() => setDraftOffset(0)}>
              回到当前周期
            </TextButton>
          )}
        </div>
        <div className={styles.controls}>
          <SearchableSelect
            label="统计资源"
            value={draftResource}
            options={[
              { value: "all", label: `全部 ${resources.length} 个资源` },
              ...resources.map((resource) => ({ value: resource.id, label: resource.name })),
            ]}
            onChange={setDraftResource}
          />
          <span className={styles.muted} role="status">
            {changed
              ? "筛选已修改，点击查询收益应用"
              : draftCycle.queryEnd
                ? `数据统计至 ${draftCycle.queryEnd}`
                : "本周期刚开始，尚无完整日数据"}
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setQuery({ offset: draftOffset, resourceId: draftResource, version: query.version + 1 })}
          >
            查询收益
          </Button>
        </div>
      </Panel>
      {cycle.queryEnd && selectedResources.length > 0 ? (
        <PeriodIncomeResults
          key={`${cycle.startDate}:${query.resourceId}`}
          platform={platform}
          resources={selectedResources}
          cycle={cycle}
          refreshVersion={refreshVersion + query.version}
        />
      ) : (
        <Panel title="周期收益" aria-label="周期收益空状态">
          <p>
            {selectedResources.length
              ? "本周期刚开始，完整日数据从明天起统计。可以选择上一周期查看收益。"
              : "该资源已不在可分析列表，请重新选择统计资源。"}
          </p>
        </Panel>
      )}
    </>
  );
}

/** Show returned income totals, inspectable day trends and paginated resource breakdowns */
function PeriodIncomeResults({
  platform,
  resources,
  cycle,
  refreshVersion,
}: {
  platform: IncomePlatform;
  resources: Resource[];
  cycle: ReturnType<typeof incomeCycle>;
  refreshVersion: number;
}) {
  const [metric, setMetric] = useState<IncomeMetric>("diamonds");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const result = useAnalyticsQuery("analytics.periodIncome", {
    platform,
    resourceIds: resources.map((resource) => resource.id),
    startDate: cycle.startDate,
    endDate: cycle.queryEnd as string,
  });
  useRefresh(result.reload, refreshVersion);
  const summary = useMemo(
    () => summarizePeriodIncome(resources, result.data?.records ?? [], cycle.dates),
    [resources, result.data, cycle.dates],
  );
  const estimate = result.data?.estimate;
  const selectedMetric = incomeMetrics.find((item) => item.id === metric) ?? incomeMetrics[0];
  const rows = summary.resources
    .filter(({ resource }) => resource.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort(
      (left, right) =>
        Number(left[metric] === null) - Number(right[metric] === null) ||
        (right[metric] ?? 0) - (left[metric] ?? 0) ||
        left.resource.name.localeCompare(right.resource.name, "zh-CN"),
    );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  return (
    <>
      <QueryState query={result} />
      {result.data !== null && !result.error && (
        <>
          <div className={styles.heading}>
            <strong>
              {platform.toUpperCase()} · {cycle.startDate} — {cycle.endDate}
            </strong>
            <span className={styles.muted}>
              统计至 {cycle.queryEnd} · {resources.length} 个资源 · {cycle.dates.length} 天
            </span>
          </div>
          <StatStrip
            items={incomeMetrics.map((item) => ({
              label: item.label,
              value: formatValue(summary.totals[item.id]),
              icon: item.id === "purchases" ? undefined : <MinecraftCurrencyIcon currency={item.id} />,
              ...(item.id === "diamonds" && platform === "pe"
                ? { detail: `预计收益 ${periodIncomeYuan(estimate?.totalYuan)}` }
                : {}),
              note:
                item.id === "diamonds" && platform === "pe"
                  ? `税后约 ${periodIncomeYuan(estimate?.afterTaxYuan)}`
                  : `已返回日记录合计 · ${item.unit}`,
            }))}
          />
          <p className={styles.note}>
            {platform === "pc" ? (
              "PC 按本平台日记录独立统计，尚无已核对的人民币估算规则，不套用 PE 分成和激励公式。实际结算请在收益管理选择 PC 查看。"
            ) : (
              <>
                {estimate
                  ? `开发者分成 ${periodIncomeYuan(estimate.developerShareYuan)} + 平台激励 ${periodIncomeYuan(estimate.subsidyYuan)}。`
                  : "缺少有效销量或退款数据，暂不能估算。"}
                使用首页的退款、分成、激励及税额算法，按所选 PE 资源的本周期销量独立估算，以账号最终结算为准。
              </>
            )}
          </p>
          <p className={styles.note} role="status">
            起止两个 22 日都计入，相邻周期会重叠一天，不可直接跨周期累加。收益按平台日数据汇总，不代表最终结算金额。
            {summary.missingDays > 0 &&
              ` 当前有 ${summary.missingDays} 个资源日未返回记录，合计可能不完整；缺失数据不按 0 计算。`}
          </p>
          <Panel className={styles.trend} title="周期内每日收益" aria-label="周期收益趋势">
            <div className={styles.controls}>
              <SegmentedControl
                label="周期收益指标"
                options={metricOptions}
                value={metric}
                onChange={(value) => {
                  setMetric(value);
                  setPage(0);
                }}
              />
              <span className={styles.muted}>悬停查看每日数值</span>
            </div>
            <TrendChart
              labels={cycle.dates}
              metric={metric}
              unit={selectedMetric.unit}
              series={[
                {
                  id: "period-total",
                  label: "所选资源合计",
                  color: "var(--g-chart-series-1)",
                  values: summary.daily.map((day) => day[metric]),
                },
              ]}
            />
          </Panel>
          <Panel className={styles.details} title="各资源周期收益" aria-label="周期资源明细">
            <div className={styles.heading}>
              <SearchField
                label="搜索周期收益资源"
                placeholder="搜索资源名称…"
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(0);
                }}
              />
              <span className={styles.muted}>按{selectedMetric.label}从高到低</span>
            </div>
            <DataTable
              caption="各资源周期收益"
              columns={["资源", "钻石收益", "绿宝石收益", "购买次数", "有记录天数"]}
              emptyText="没有匹配的资源"
              rows={rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((row) => (
                <tr key={row.resource.id}>
                  <th scope="row">
                    <span className={styles.resourceName} title={row.resource.name}>
                      <Swatch color={row.resource.color} />
                      <span>{row.resource.name}</span>
                    </span>
                  </th>
                  <td>{formatValue(row.diamonds)}</td>
                  <td>{formatValue(row.emeralds)}</td>
                  <td>{formatValue(row.purchases)}</td>
                  <td>
                    {row.days} / {cycle.dates.length}
                  </td>
                </tr>
              ))}
            />
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onChange={setPage}
              note={`共 ${rows.length} 个资源 · 每页 ${PAGE_SIZE} 个`}
            />
            <TableNote>收到 {summary.recordCount} 条日记录 · “—”表示没有记录或指标缺失 · 搜索不影响上方合计</TableNote>
          </Panel>
        </>
      )}
    </>
  );
}
