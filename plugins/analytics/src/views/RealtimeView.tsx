import { Button, Notice, Pagination, Panel, SearchField, SegmentedControl, TextButton } from "@glaze/plugin-sdk";
import { useMemo, useRef, useState } from "react";
import { formatValue, type RealtimeDay, type Resource, shiftDay, todayKey } from "../data";
import { QueryState, useRefresh } from "../QueryState";
import { useRealtimeIncome } from "../useRealtimeIncome";
import { DataTable, mutedClass } from "../widgets/DataTable";
import { InlineSelect } from "../widgets/InlineSelect";
import { MinecraftCurrencyIcon } from "../widgets/MinecraftCurrencyIcon";
import { SearchableSelect } from "../widgets/SearchableSelect";
import { StatStrip } from "../widgets/StatStrip";
import { Swatch } from "../widgets/Swatch";
import styles from "./RealtimeView.module.css";

const RESOURCE_PAGE_SIZE = 8;
const ORDER_PAGE_SIZE = 20;
const dayOptions = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
] as const;
const currencyOptions = [
  { value: "all", label: "全部" },
  { value: "diamond", label: "钻石" },
  { value: "point", label: "绿宝石" },
  { value: "unknown", label: "未提供币种" },
];
const sortOptions = [
  { value: "diamonds", label: "钻石收益从高到低" },
  { value: "emeralds", label: "绿宝石收益从高到低" },
  { value: "purchases", label: "订单数从多到少" },
  { value: "name", label: "资源名称" },
];
type ResourceFilter = "all" | "income" | "zero" | "failed";
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  dateStyle: "short",
  timeStyle: "medium",
  hour12: false,
});

/** Preserve unknown currency codes instead of assuming a conversion */
function currencyName(currency: string): string {
  return ({ diamond: "钻石", point: "绿宝石", free: "免费", unknown: "币种未提供" } as Record<string, string>)[currency] ?? currency;
}

/** Convert explicitly zoned platform timestamps to Beijing time */
function orderTime(value: string): string {
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return value;
  return timeFormatter.format(new Date(value));
}

/** Scan large resource sets without squeezing cards or rendering every order at once */
export function RealtimeView({ resources, refreshVersion }: { resources: Resource[]; refreshVersion: number }) {
  const [day, setDay] = useState<RealtimeDay>("today");
  const [resourceId, setResourceId] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ResourceFilter>("all");
  const [sort, setSort] = useState("diamonds");
  const [resourcePage, setResourcePage] = useState(0);
  const [orderPage, setOrderPage] = useState(0);
  const resourcePanel = useRef<HTMLDivElement>(null);
  const orderPanel = useRef<HTMLDivElement>(null);
  const date = shiftDay(todayKey(), day === "today" ? 0 : -1);
  const result = useRealtimeIncome(date, resources.map((resource) => resource.id));
  useRefresh(result.reload, refreshVersion);
  const incomes = result.data?.resources;
  const failed = result.data?.failedResourceIds;
  const incomeById = useMemo(() => new Map(incomes?.map((income) => [income.resourceId, income])), [incomes]);
  const resourceById = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
  const failedSet = useMemo(() => new Set(failed), [failed]);
  const failureById = new Map(result.data?.failures?.map((failure) => [failure.resourceId, failure.message]));
  const rows = useMemo(
    () =>
      resources.map((resource) => {
        const income = incomeById.get(resource.id);
        const status: ResourceFilter =
          failedSet.has(resource.id) || !income
            ? "failed"
            : income.diamonds !== 0 || income.emeralds !== 0 || income.purchases > 0
              ? "income"
              : "zero";
        return { resource, income, status };
      }),
    [resources, incomeById, failedSet],
  );
  const counts = {
    all: rows.length,
    income: rows.filter((row) => row.status === "income").length,
    zero: rows.filter((row) => row.status === "zero").length,
    failed: rows.filter((row) => row.status === "failed").length,
  };
  const filterOptions = [
    { value: "all", label: `全部 ${counts.all}` },
    { value: "income", label: `有收益 / 订单 ${counts.income}` },
    { value: "zero", label: `暂无收益 ${counts.zero}` },
    { value: "failed", label: `查询失败 ${counts.failed}` },
  ] as const;
  const keyword = search.trim().toLocaleLowerCase();
  const matching = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            (filter === "all" || row.status === filter) && row.resource.name.toLocaleLowerCase().includes(keyword),
        )
        .sort((left, right) => {
          // Rank the full result before pagination, breaking equal income by the other currency
          if (sort === "name") return left.resource.name.localeCompare(right.resource.name, "zh-CN");
          const key = sort === "purchases" ? "purchases" : sort === "emeralds" ? "emeralds" : "diamonds";
          const secondaryKey = key === "diamonds" ? "emeralds" : "diamonds";
          return (
            Number(!left.income) - Number(!right.income) ||
            (right.income?.[key] ?? 0) - (left.income?.[key] ?? 0) ||
            (right.income?.[secondaryKey] ?? 0) - (left.income?.[secondaryKey] ?? 0) ||
            left.resource.name.localeCompare(right.resource.name, "zh-CN")
          );
        }),
    [rows, filter, keyword, sort],
  );
  const pageCount = Math.max(1, Math.ceil(matching.length / RESOURCE_PAGE_SIZE));
  const page = Math.min(resourcePage, pageCount - 1);
  const pageRows = matching.slice(page * RESOURCE_PAGE_SIZE, (page + 1) * RESOURCE_PAGE_SIZE);
  const orders = useMemo(
    () => (incomes ?? []).flatMap((income) => income.orders.map((order, position) => ({ ...order, rowKey: `${order.resourceId}-${order.id}-${position}` }))).sort((left, right) => right.time.localeCompare(left.time)),
    [incomes],
  );
  const activeResourceId = resourceById.has(resourceId) ? resourceId : "all";
  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          (activeResourceId === "all" || activeResourceId === order.resourceId) &&
          (currency === "all" || currency === order.currency),
      ),
    [orders, activeResourceId, currency],
  );
  const orderPageCount = Math.max(1, Math.ceil(visibleOrders.length / ORDER_PAGE_SIZE));
  const currentOrderPage = Math.min(orderPage, orderPageCount - 1);
  const pageOrders = visibleOrders.slice(currentOrderPage * ORDER_PAGE_SIZE, (currentOrderPage + 1) * ORDER_PAGE_SIZE);
  const successCount = rows.filter((row) => row.status !== "failed").length;
  const incompleteResources = (incomes ?? []).filter((income) => income.ordersIncomplete);
  const unknownCurrencyCount = orders.filter((order) => order.currency === "unknown").length;

  /** Sum authoritative platform totals, keeping an entirely failed query unknown */
  const total = (key: "diamonds" | "emeralds" | "purchases") =>
    incomes?.length ? incomes.reduce((sum, income) => sum + income[key], 0) : null;

  /** Reveal failures in the resource list instead of expanding a long alert */
  const showFailures = () => {
    setFilter("failed");
    setSearch("");
    setResourcePage(0);
    resourcePanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** Open a resource's order list with its first page visible */
  const openOrders = (id: string) => {
    setResourceId(id);
    setCurrency("all");
    setOrderPage(0);
    orderPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <Panel className={styles.datePanel} aria-label="实时收益筛选">
        <div className={styles.dateRow}>
          <span className={styles.muted}>统计日期</span>
          <SegmentedControl
            label="实时收益日期"
            options={dayOptions}
            value={day}
            onChange={(next) => {
              setDay(next);
              setResourcePage(0);
              setOrderPage(0);
            }}
          />
          <span className={styles.muted}>
            {date} · 北京时间{day === "today" ? " · 当日未完结" : " · 全天"}
          </span>
          <Button size="xs" disabled={result.loading} onClick={result.reload}>
            {result.loading ? "查询中…" : "刷新收益"}
          </Button>
        </div>
        <p className={styles.note}>
          {result.data?.queriedAt ? `最近更新 ${orderTime(result.data.queriedAt)} · ` : ""}普通手游资源 · 收益按平台返回总额汇总
        </p>
      </Panel>
      <QueryState query={result} />
      {result.data !== null && (
        <>
          {result.error && <p className={styles.failed}>本次更新失败，当前显示上次成功查询的数据。</p>}
          {counts.failed > 0 && (
            <Notice
              action={
                <TextButton tone="warning" disabled={result.loading} onClick={result.retryFailures}>
                  仅重试失败资源
                </TextButton>
              }
            >
              <div className={styles.failureSummary}>
                <strong>{counts.failed} 个资源查询失败，{successCount ? "当前为部分汇总" : "暂无可用收益数据"}</strong>
                <span>
                  已获取 {successCount} / {resources.length} 个资源的数据
                </span>
                <TextButton tone="warning" onClick={showFailures}>
                  查看失败资源
                </TextButton>
              </div>
            </Notice>
          )}
          <StatStrip
            items={[
              {
                label: "钻石收益",
                icon: <MinecraftCurrencyIcon currency="diamonds" />,
                value: formatValue(total("diamonds")),
                note: counts.failed ? "部分汇总 · 仅计入成功资源" : "钻石 · 全部资源",
              },
              {
                label: "绿宝石收益",
                icon: <MinecraftCurrencyIcon currency="emeralds" />,
                value: formatValue(total("emeralds")),
                note: counts.failed ? "部分汇总 · 仅计入成功资源" : "绿宝石 · 全部资源",
              },
              {
                label: "平台订单数",
                value: formatValue(total("purchases")),
                note: counts.failed ? "部分汇总 · 仅计入成功资源" : "平台返回 · 笔",
              },
            ]}
          />
          <div ref={resourcePanel} className={styles.anchor}>
            <Panel
              className={styles.resourcePanel}
              title="资源收益"
              aria-label="各资源收益"
              actions={
                <span className={styles.muted}>
                  {successCount} 成功 · {counts.failed} 失败
                </span>
              }
            >
              <div className={styles.toolbar}>
                <SearchField
                  label="搜索收益资源"
                  placeholder="搜索资源名称…"
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setResourcePage(0);
                  }}
                />
                <InlineSelect
                  label="排序"
                  value={sort}
                  options={sortOptions}
                  onChange={(value) => {
                    setSort(value);
                    setResourcePage(0);
                  }}
                />
              </div>
              <div className={styles.statusFilters}>
                <SegmentedControl
                  label="资源收益状态"
                  options={filterOptions}
                  value={filter}
                  onChange={(value) => {
                    setFilter(value);
                    setResourcePage(0);
                  }}
                />
              </div>
              <DataTable
                caption="各资源实时收益"
                columns={["资源", "钻石", "绿宝石", "订单", "查询状态", "明细"]}
                emptyText={filter === "failed" && counts.failed === 0 ? "全部资源已获取，没有查询失败的资源" : "当前筛选下没有资源，试试其他名称或状态"}
                rows={pageRows.map(({ resource, income, status }) => (
                  <tr key={resource.id} className={activeResourceId === resource.id ? styles.selectedRow : undefined}>
                    <th scope="row">
                      <span className={styles.resourceName} title={resource.name}>
                        <Swatch color={resource.color} />
                        <span>{resource.name}</span>
                      </span>
                    </th>
                    <td>{formatValue(income?.diamonds)}</td>
                    <td>{formatValue(income?.emeralds)}</td>
                    <td>{formatValue(income?.purchases)}</td>
                    <td>
                      <div className={styles.queryStatus}>
                        <span className={status === "failed" ? styles.failed : styles.muted}>
                          {status === "failed" ? "查询失败" : income?.ordersIncomplete ? "收益已获取 · 明细不完整" : "已获取"}
                        </span>
                        {status === "failed" && <span className={styles.failureReason}>{failureById.get(resource.id) ?? "未返回该资源数据，请重试"}</span>}
                      </div>
                    </td>
                    <td>
                      <Button
                        size="xs"
                        disabled={!income || status === "failed"}
                        onClick={() => openOrders(resource.id)}
                      >
                        查看订单
                      </Button>
                    </td>
                  </tr>
                ))}
              />
              <div className={styles.listFooter}>
                <span className={styles.muted}>
                  {matching.length
                    ? `显示 ${page * RESOURCE_PAGE_SIZE + 1}–${Math.min((page + 1) * RESOURCE_PAGE_SIZE, matching.length)} / ${matching.length} 个资源`
                    : "0 个资源"}{" "}
                  · 汇总不受列表筛选影响
                </span>
                {(search || filter !== "all") && (
                  <TextButton
                    tone="subtle"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                      setResourcePage(0);
                    }}
                  >
                    重置筛选
                  </TextButton>
                )}
              </div>
              <Pagination
                page={page}
                pageCount={pageCount}
                onChange={setResourcePage}
                note={`每页 ${RESOURCE_PAGE_SIZE} 个`}
              />
            </Panel>
          </div>
          <div ref={orderPanel} className={styles.anchor}>
            <Panel
              className={styles.ordersPanel}
              title="订单明细"
              aria-label="订单明细"
              actions={<span className={styles.muted}>已返回 {visibleOrders.length} 条明细</span>}
            >
              <div className={styles.orderFilters}>
                <SearchableSelect
                  label="资源"
                  value={activeResourceId}
                  options={[
                    { value: "all", label: "全部资源" },
                    ...resources.map((resource) => ({ value: resource.id, label: resource.name })),
                  ]}
                  onChange={(value) => {
                    setResourceId(value);
                    setOrderPage(0);
                  }}
                />
                <InlineSelect
                  label="标价货币"
                  value={currency}
                  options={currencyOptions}
                  onChange={(value) => {
                    setCurrency(value);
                    setOrderPage(0);
                  }}
                />
                {activeResourceId !== "all" && (
                  <TextButton
                    tone="subtle"
                    onClick={() => {
                      setResourceId("all");
                      setOrderPage(0);
                    }}
                  >
                    查看全部资源
                  </TextButton>
                )}
              </div>
              {activeResourceId !== "all" && failedSet.has(activeResourceId) && (
                <p className={styles.failed}>该资源查询失败，暂无可用订单数据。</p>
              )}
              {(incompleteResources.length > 0 || unknownCurrencyCount > 0) && (
                <p className={styles.note}>
                  {unknownCurrencyCount > 0 && `${unknownCurrencyCount} 条订单未提供标价币种，已保留并标注。`}
                  {incompleteResources.length > 0 && `${incompleteResources.length} 个资源的订单明细未完整返回或无法识别。`}
                  收益汇总仍使用平台总额。
                </p>
              )}
              <div className={styles.ordersTable}>
                <DataTable
                  caption="平台返回的订单明细"
                  columns={["订单号", "资源", "发货时间", "标价", "退款状态"]}
                  emptyText="当前筛选下暂无已返回的订单明细"
                  rows={pageOrders.map((order) => (
                    <tr key={order.rowKey}>
                      <td className={mutedClass}>
                        <span className={styles.orderId} title={order.id}>
                          {order.id}
                        </span>
                      </td>
                      <td>
                        <span
                          className={styles.orderName}
                          title={resourceById.get(order.resourceId)?.name ?? order.resourceId}
                        >
                          {resourceById.get(order.resourceId)?.name ?? order.resourceId}
                        </span>
                      </td>
                      <td>{orderTime(order.time)}</td>
                      <td>
                        {formatValue(order.amount)} {currencyName(order.currency)}
                      </td>
                      <td>{order.refundStatus || "未提供"}</td>
                    </tr>
                  ))}
                />
              </div>
              <Pagination
                page={currentOrderPage}
                pageCount={orderPageCount}
                onChange={setOrderPage}
                note={`每页 ${ORDER_PAGE_SIZE} 条`}
              />
              <p className={styles.note}>
                汇总采用平台总额；明细可能不完整。标价可能与折扣后实付金额不同，退款状态按平台返回显示。
              </p>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
