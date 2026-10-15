import {
  Button,
  callHost,
  EmptyState,
  Icon,
  type IncomePlatform,
  type IncomeRecord,
  incomeStatusLabels,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  SegmentedControl,
  Tag,
  TextButton,
  useHostQuery,
  useSession,
} from "@glaze/plugin-sdk";
import { Fragment, useState } from "react";
import { IncomeDetailCache } from "./detail-cache";
import styles from "./IncomePage.module.css";
import { useIncomeDetail } from "./useIncomeDetail";

const platforms = [
  { value: "pe", label: "手机版 PE" },
  { value: "pc", label: "电脑版 PC" },
] as const;
const PAGE_SIZE = 12;
const moneyFormatter = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const settlementTypes: Record<string, string> = {
  individual_withhold: "个人开发者代扣代缴",
  individual_owned: "个人开发者自备税票",
  company_owned: "公司开发者自备税票",
};

/** Display platform yuan without silently substituting zero for missing data */
function yuan(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `¥ ${moneyFormatter.format(value)}`;
}

/** Keep unfamiliar platform statuses visible instead of labelling them settled */
function Status({ value }: { value: string }) {
  return (
    <Tag tone={["fail", "pay_fail", "need_modify"].includes(value) ? "warning" : "default"}>
      {incomeStatusLabels[value] ?? `未知状态（${value}）`}
    </Tag>
  );
}

/** Isolate all query, selection and filter state when the active account changes */
export function IncomePage() {
  const { current } = useSession();
  return current ? (
    <AccountIncome key={current.id} account={current.id} />
  ) : (
    <EmptyState title="请先登录开发者账号" hint="登录后查看月度收益与结算记录" />
  );
}

/** A platform switch mounts a separate query so old platform data never flashes under the new label */
function AccountIncome({ account }: { account: string }) {
  const [platform, setPlatform] = useState<IncomePlatform>("pe");
  return <PlatformIncome key={platform} account={account} platform={platform} onPlatformChange={setPlatform} />;
}

/** Browse monthly settlements and expand details directly below the selected record */
function PlatformIncome({
  account,
  platform,
  onPlatformChange,
}: {
  account: string;
  platform: IncomePlatform;
  onPlatformChange: (value: IncomePlatform) => void;
}) {
  const query = useHostQuery("income.list", { account, platform });
  const [detailCache] = useState(() => new IncomeDetailCache((id) => callHost("income.detail", { account, id })));
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const records = query.data?.records ?? [];
  const months = [...new Set(records.map((entry) => entry.month))];
  const statuses = [...new Set([...Object.keys(incomeStatusLabels), ...records.map((entry) => entry.status)])];
  const visible = records.filter((entry) => (!month || entry.month === month) && (!status || entry.status === status));
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const selected = visible.find((entry) => entry.id === selectedId);

  /** Refresh both the list and any selected detail while keeping the current filters */
  function refresh() {
    query.reload();
    detailCache.invalidate();
    setDetailVersion((value) => value + 1);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="收益管理"
        subtitle="月度收益与结算记录 · 金额单位：人民币元"
        actions={
          <Button onClick={refresh} disabled={query.loading}>
            {query.loading ? "更新中…" : "刷新"}
          </Button>
        }
      />
      <div className={styles.platforms}>
        <SegmentedControl label="收益平台" options={platforms} value={platform} onChange={onPlatformChange} />
        <span className={styles.muted}>数据来自网易开发者平台</span>
      </div>
      {query.error && (
        <Notice
          action={
            <TextButton onClick={refresh} disabled={query.loading}>
              重试
            </TextButton>
          }
        >
          收益加载失败：{query.error.message}
          {query.data ? "；当前显示上次成功加载的数据" : ""}
        </Notice>
      )}
      <Panel title="月度收益" icon={<Icon name="nav.income" size={20} />}>
        <div className={styles.filters}>
          <label>
            月份
            <select
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setPage(0);
              }}
            >
              <option value="">全部月份</option>
              {months.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            结算状态
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="">全部状态</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {incomeStatusLabels[value] ?? `未知状态（${value}）`}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.muted}>{query.data ? `筛选结果 ${visible.length} 笔` : "尚未加载"}</span>
          {(month || status) && (
            <TextButton
              onClick={() => {
                setMonth("");
                setStatus("");
                setPage(0);
              }}
            >
              清除筛选
            </TextButton>
          )}
        </div>
        {query.loading && !query.data && (
          <div role="status" className={styles.state}>
            正在读取月度收益…
          </div>
        )}
        {!query.loading && query.data && visible.length === 0 && (
          <EmptyState
            title={records.length ? "没有符合条件的收益记录" : "暂无月度收益记录"}
            hint={records.length ? "试试其他月份或结算状态" : "平台生成该端的月度账单后将在这里显示"}
          />
        )}
        {visible.length > 0 && (
          <div className={styles.tableWrap} aria-busy={query.loading}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">收益月份</th>
                  <th scope="col">月度收益</th>
                  <th scope="col">税费</th>
                  <th scope="col">扣费后金额</th>
                  <th scope="col">结算状态</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((entry) => (
                  <Fragment key={entry.id}>
                    <tr data-selected={selected?.id === entry.id}>
                      <th scope="row">{entry.month}</th>
                      <td>{yuan(entry.incomeYuan)}</td>
                      <td>{yuan(entry.taxYuan)}</td>
                      <td>{yuan(entry.netYuan)}</td>
                      <td>
                        <Status value={entry.status} />
                      </td>
                      <td>
                        <TextButton
                          aria-expanded={selected?.id === entry.id}
                          aria-controls={selected?.id === entry.id ? "income-detail" : undefined}
                          onClick={() => setSelectedId(selected?.id === entry.id ? null : entry.id)}
                        >
                          {selected?.id === entry.id ? "收起详情" : "查看详情"}
                        </TextButton>
                      </td>
                    </tr>
                    {selected?.id === entry.id && (
                      <tr className={styles.detailRow}>
                        <td colSpan={6}>
                          <IncomeDetails key={`${entry.id}:${detailVersion}`} cache={detailCache} entry={entry} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} note={`每页 ${PAGE_SIZE} 笔`} />
        <p className={styles.hint}>“—”表示平台未提供金额；可结算金额可能包含历史结余，不跨月累加。</p>
      </Panel>
    </div>
  );
}

/** Show known monthly values immediately and fill the remaining fields from cached or refreshed details */
function IncomeDetails({ cache, entry }: { cache: IncomeDetailCache; entry: IncomeRecord }) {
  const query = useIncomeDetail(cache, entry.id);
  const data = query.data ?? entry;
  const amounts: [string, number | null | undefined][] = [
    ["月度收益", data?.incomeYuan],
    ["激励收益", data?.incentiveYuan],
    ["游玩计划收益", data?.playPlanYuan],
    ["广告收益", query.data?.advertisingYuan],
    ["税费", data?.taxYuan],
    ["技术服务费", data?.serviceFeeYuan],
    ["使用费", data?.usageFeeYuan],
    ["调整金额", query.data?.adjustmentYuan],
    ["扣费后金额", data?.netYuan],
    ["平台可结算金额", data?.availableYuan],
  ];
  return (
    <div id="income-detail">
      <Panel className={styles.detailPanel} title={`${entry.month} · 收益详情`}>
        {query.error && (
          <Notice
            action={
              <TextButton onClick={query.reload} disabled={query.loading}>
                重试
              </TextButton>
            }
          >
            详情加载失败：{query.error.message}
          </Notice>
        )}
        <div className={styles.platforms}>
          <Status value={data.status} />
          <span className={styles.muted} role="status">
            {query.loading
              ? "正在更新详情…"
              : query.data?.settlementType
                ? (settlementTypes[query.data.settlementType] ?? query.data.settlementType)
                : query.data
                  ? "平台未提供结算类型"
                  : "详情暂不可用"}
          </span>
        </div>
        <dl className={styles.details}>
          {amounts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{yuan(value)}</dd>
            </div>
          ))}
          <div>
            <dt>钻石总量</dt>
            <dd>{data.diamonds?.toLocaleString("zh-CN") ?? "—"}</dd>
          </div>
        </dl>
        <div className={styles.carryover}>
          <h3>可结算月份明细</h3>
          {data.carryover === null ? (
            <p className={styles.muted}>平台未提供明细</p>
          ) : data.carryover.length === 0 ? (
            <p className={styles.muted}>暂无可结算月份</p>
          ) : (
            <dl className={styles.details}>
              {data.carryover.map((item) => (
                <div key={item.month}>
                  <dt>{item.month}</dt>
                  <dd>{yuan(item.incomeYuan)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <p className={styles.hint}>
          扣费后金额 = 月度收益 − 税费 − 技术服务费 −
          使用费。激励、游玩计划及广告收益为平台分项展示，不重复加到月度收益。
        </p>
      </Panel>
    </div>
  );
}
