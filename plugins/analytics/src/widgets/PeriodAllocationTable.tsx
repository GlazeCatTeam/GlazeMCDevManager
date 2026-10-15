import { type AnalyticsPeriodEstimate, Pagination, Panel, SearchField } from "@glaze/plugin-sdk";
import { useState } from "react";
import { formatValue } from "../data";
import { periodIncomeYuan, sumAllocatedIncome } from "../period-income";
import styles from "../views/PeriodIncomeView.module.css";
import { DataTable, TableNote } from "./DataTable";

/** Inspect additive account allocations, keeping full totals visible while searching or paging */
export function PeriodAllocationTable({
  estimate,
  selectedId,
}: {
  estimate: AnalyticsPeriodEstimate;
  selectedId: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const rows = estimate.allocations
    .filter(
      (row) =>
        (selectedId === "all" || row.resourceId === selectedId) &&
        row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => b.afterTaxYuan - a.afterTaxYuan || a.resourceId.localeCompare(b.resourceId));
  const subtotal = sumAllocatedIncome(rows);
  const pageCount = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  return (
    <Panel className={styles.details} title="模组收益分摊" aria-label="模组收益分摊">
      <div className={styles.heading}>
        <SearchField
          label="搜索收益分摊模组"
          placeholder="搜索模组名称…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(0);
          }}
        />
        <span className={styles.muted}>
          按分摊税后收益排序 · {estimate.source === "pe-period-daily" ? "临时日统计" : "平台月汇总"}
        </span>
      </div>
      <DataTable
        caption="模组收益分摊"
        columns={["模组", "估算钻石", "基础分成", "激励分摊", "税前收益", "分摊税额", "税后收益"]}
        emptyText="当前筛选没有可分摊的模组"
        rows={rows.slice(currentPage * 10, (currentPage + 1) * 10).map((row) => (
          <tr key={row.resourceId}>
            <th scope="row">{row.name}</th>
            <td>{formatValue(row.diamonds)}</td>
            <td>{periodIncomeYuan(row.developerShareYuan)}</td>
            <td>{periodIncomeYuan(row.subsidyYuan)}</td>
            <td>{periodIncomeYuan(row.totalYuan)}</td>
            <td>{periodIncomeYuan(row.taxYuan)}</td>
            <td>{periodIncomeYuan(row.afterTaxYuan)}</td>
          </tr>
        ))}
      />
      <Pagination
        page={currentPage}
        pageCount={pageCount}
        onChange={setPage}
        note={`共 ${rows.length} 个模组 · 每页 10 个`}
      />
      <TableNote>
        当前筛选合计：税前 {periodIncomeYuan(subtotal.totalYuan)} · 税额 {periodIncomeYuan(subtotal.taxYuan)} · 税后{" "}
        {periodIncomeYuan(subtotal.afterTaxYuan)}
      </TableNote>
      <TableNote>
        全周期合计：税前 {periodIncomeYuan(estimate.totalYuan)} · 税额 {periodIncomeYuan(estimate.taxYuan)} · 税后{" "}
        {periodIncomeYuan(estimate.afterTaxYuan)}。搜索和分页不改变账号总额。
      </TableNote>
      <TableNote>
        全账号统一确定激励档位与奖励名额，账号奖励按钻石占比分摊，税额按各模组税前收益占比分摊。金额按分处理尾差，全部模组合计与周期总额一致。分摊仅用于分析，不代表平台逐模组结算。
      </TableNote>
    </Panel>
  );
}
