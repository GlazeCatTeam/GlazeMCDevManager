import {
  Button,
  type IncomePlatform,
  Notice,
  Pagination,
  Panel,
  SearchField,
  SegmentedControl,
  TextButton,
} from "@glaze/plugin-sdk";
import { useContext, useMemo, useState } from "react";
import { formatValue, type Resource, todayKey, workResources } from "../data";
import {
  type IncomeMetric,
  incomeCycle,
  incomeMetrics,
  periodIncomeYuan,
  sumAllocatedIncome,
  summarizePeriodIncome,
} from "../period-income";
import { QuerySkeleton, QueryState, useRefresh } from "../QueryState";
import { useAnalysisPreference } from "../useAnalysisPreference";
import { AnalysisActivity, useAnalysisSnapshot, useAnalyticsQuery } from "../useAnalyticsQuery";
import { DataTable, TableNote } from "../widgets/DataTable";
import { InlineSelect } from "../widgets/InlineSelect";
import { MinecraftCurrencyIcon } from "../widgets/MinecraftCurrencyIcon";
import { PeriodAllocationTable } from "../widgets/PeriodAllocationTable";
import { SearchableSelect } from "../widgets/SearchableSelect";
import { StatStrip } from "../widgets/StatStrip";
import { Swatch } from "../widgets/Swatch";
import { TrendChart } from "../widgets/TrendChart";
import styles from "./PeriodIncomeView.module.css";

const PAGE_SIZE = 10;
const metricOptions = incomeMetrics.map(({ id, label }) => ({ value: id, label }));

/** Keep each visited platform's filters mounted while preserving separate resource and query scopes */
export function PeriodIncomeView({ refreshVersion }: { refreshVersion: number }) {
  const visible = useContext(AnalysisActivity);
  const [platform, setPlatform] = useAnalysisPreference<IncomePlatform>("period.platform", "pe", ["pe", "pc"]);
  const [visited, setVisited] = useState<IncomePlatform[]>([platform]);
  const [versions, setVersions] = useState({ pe: refreshVersion, pc: refreshVersion });
  const [previous, setPrevious] = useState(refreshVersion);
  if (previous !== refreshVersion) {
    setPrevious(refreshVersion);
    setVersions((old) => ({ ...old, [platform]: refreshVersion }));
  }
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
          onChange={(next) => {
            setPlatform(next);
            setVisited((old) => (old.includes(next) ? old : [...old, next]));
          }}
        />
        <span className={styles.muted}>各平台独立查询和统计</span>
      </Panel>
      {visited.map((item) => (
        <div key={item} hidden={platform !== item} className={styles.platformContent}>
          <AnalysisActivity.Provider value={visible && platform === item}>
            <PlatformPeriodIncome platform={item} refreshVersion={versions[item]} />
          </AnalysisActivity.Provider>
        </div>
      ))}
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
      <QueryState query={works} label="资源列表" />
      <QuerySkeleton loading={works.loading && works.data === null} />
      {works.data &&
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
  const [offset, setOffset] = useAnalysisPreference<number>(
    `period.${platform}.offset`,
    0,
    Array.from({ length: 12 }, (_, index) => -index),
  );
  const [resourceId, setResourceId] = useAnalysisPreference<string>(`period.${platform}.resource`, "all");
  const cycle = incomeCycle(offset, today);
  const selectedResources = resources.filter((resource) => resourceId === "all" || resource.id === resourceId);
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
          <Button size="sm" disabled={offset === -11} onClick={() => setOffset((value) => value - 1)}>
            上一周期
          </Button>
          <InlineSelect
            label="收益周期"
            value={String(offset)}
            options={cycleOptions}
            onChange={(value) => setOffset(Number(value))}
          />
          <Button size="sm" disabled={offset === 0} onClick={() => setOffset((value) => value + 1)}>
            下一周期
          </Button>
          {offset !== 0 && (
            <TextButton tone="subtle" onClick={() => setOffset(0)}>
              回到当前周期
            </TextButton>
          )}
        </div>
        <div className={styles.controls}>
          <SearchableSelect
            label="统计资源"
            value={resourceId}
            options={[
              { value: "all", label: `全部 ${resources.length} 个资源` },
              ...resources.map((resource) => ({ value: resource.id, label: resource.name })),
            ]}
            onChange={setResourceId}
          />
          <span className={styles.muted} role="status">
            {cycle.queryEnd ? `数据统计至 ${cycle.queryEnd} · 选择后自动更新` : "本周期刚开始，尚无完整日数据"}
          </span>
        </div>
      </Panel>
      {cycle.queryEnd && selectedResources.length > 0 ? (
        <PeriodIncomeResults
          platform={platform}
          selectedId={resourceId}
          resources={resources}
          cycle={cycle}
          refreshVersion={refreshVersion}
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
  selectedId: requestedId,
  platform,
  resources,
  cycle: requestedCycle,
  refreshVersion,
}: {
  selectedId: string;
  platform: IncomePlatform;
  resources: Resource[];
  cycle: ReturnType<typeof incomeCycle>;
  refreshVersion: number;
}) {
  const [metric, setMetric] = useAnalysisPreference<IncomeMetric>(
    `period.${platform}.metric`,
    "diamonds",
    incomeMetrics.map((item) => item.id),
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const requestedResources = resources.filter((resource) => requestedId === "all" || resource.id === requestedId);
  const query = useAnalyticsQuery("analytics.periodIncome", {
    settlementMonth: requestedCycle.endDate.slice(0, 7),
    allResources: platform === "pe" || requestedId === "all",
    platform,
    resourceIds: (platform === "pe" ? resources : requestedResources).map((resource) => resource.id),
    startDate: requestedCycle.startDate,
    endDate: requestedCycle.queryEnd as string,
  });
  const result = useAnalysisSnapshot(query, { cycle: requestedCycle, selectedId: requestedId });
  const { cycle, selectedId } = result.scope;
  const allResources = selectedId === "all";
  const displayedResources = useMemo(
    () => resources.filter((resource) => selectedId === "all" || resource.id === selectedId),
    [resources, selectedId],
  );
  useRefresh(result.reload, refreshVersion);
  const summary = useMemo(
    () => summarizePeriodIncome(displayedResources, result.data?.records ?? [], cycle.dates),
    [displayedResources, result.data, cycle.dates],
  );
  const estimate = result.data?.estimate;
  const allocations = estimate?.allocations.filter((row) => allResources || row.resourceId === selectedId) ?? [];
  const displayedEstimate = estimate && allocations.length ? sumAllocatedIncome(allocations) : null;
  const provisional = estimate?.source === "pe-period-daily";
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
      <QueryState
        query={result}
        scopeLabel={`${platform.toUpperCase()} · ${cycle.startDate} — ${cycle.endDate} · ${selectedId === "all" ? "全部资源" : (displayedResources[0]?.name ?? "所选资源")}`}
      />
      <QuerySkeleton loading={result.loading && result.data === null} />
      {result.data !== null && (
        <>
          <div className={styles.heading}>
            <strong>
              {platform.toUpperCase()} · {cycle.startDate} — {cycle.endDate}
            </strong>
            <span className={styles.muted}>
              统计至 {cycle.queryEnd} · {displayedResources.length} 个资源 · {cycle.dates.length} 天
            </span>
          </div>
          {platform === "pe" && !estimate && result.data.estimateError && (
            <Notice action={<TextButton onClick={result.reload}>重试估算</TextButton>}>
              预计收益暂不可用：{result.data.estimateError}
            </Notice>
          )}
          {platform === "pe" && estimate && !allResources && !allocations.length && (
            <Notice>本期估算数据中没有所选模组的记录，暂不能显示其分摊金额；全周期合计仍可在下方查看。</Notice>
          )}
          <StatStrip
            items={incomeMetrics.map((item) => ({
              label: item.label,
              value: formatValue(summary.totals[item.id]),
              icon: item.id === "purchases" ? undefined : <MinecraftCurrencyIcon currency={item.id} />,
              ...(item.id === "diamonds" && platform === "pe"
                ? {
                    detail: `${provisional ? "临时" : ""}${allResources ? "预计收益" : "分摊收益"} ${periodIncomeYuan(displayedEstimate?.totalYuan)}`,
                  }
                : {}),
              note:
                item.id === "diamonds" && platform === "pe"
                  ? `税后约 ${periodIncomeYuan(displayedEstimate?.afterTaxYuan)}`
                  : `已返回日记录合计 · ${item.unit}`,
            }))}
          />
          <p className={styles.note}>
            {platform === "pc" ? (
              "PC 按本平台日记录独立统计，尚无已核对的人民币估算规则，不套用 PE 分成和激励公式。实际结算请在收益管理选择 PC 查看。"
            ) : (
              <>
                {estimate
                  ? `全周期税前 ${periodIncomeYuan(estimate.totalYuan)}，税后 ${periodIncomeYuan(estimate.afterTaxYuan)}。当前范围基础分成 ${periodIncomeYuan(displayedEstimate?.developerShareYuan)} + 激励分摊 ${periodIncomeYuan(displayedEstimate?.subsidyYuan)}。`
                  : (result.data?.estimateError ?? "平台月汇总尚未提供，暂不能估算。")}
                {estimate &&
                  (provisional
                    ? `人民币暂按 ${estimate.startDate} 至 ${estimate.endDate} 已返回日记录的 ${formatValue(estimate.diamonds)} 钻石（扣已知退款）估算。`
                    : `人民币按 ${estimate.month} PE平台月汇总的 ${formatValue(estimate.diamonds)} 钻石统一估算，包含月汇总返回的全部资源。`)}
                {estimate && "选择模组只查看其分摊结果，不重新计算激励或税额。"}
                {estimate &&
                  `周期专用算法：比例激励按扣成本后完整流水计算。成本率 ${((estimate.costRate ?? 0.3) * 100).toFixed(2)}%${estimate.costSourceMonth ? `，来源 ${estimate.costSourceMonth} 已结算账单` : "（默认值）"}。`}
                {estimate?.warnings?.join("；")}
                以平台最终结算为准，临时估算与月汇总估算可能不同。
              </>
            )}
          </p>
          {platform === "pe" && estimate && (
            <PeriodAllocationTable key={selectedId} estimate={estimate} selectedId={selectedId} />
          )}
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
