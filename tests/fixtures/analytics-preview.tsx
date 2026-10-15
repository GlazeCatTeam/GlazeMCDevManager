import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AccountSummary, AnalyticsRecord, GlazeBridge, WorkSummary } from "../../packages/contracts/src";
import { estimateProfit } from "../../packages/netease/src/income/rules";
import { SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { AnalyticsPage } from "../../plugins/analytics/src/AnalyticsPage";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";
import shellStyles from "../../apps/desktop/src/renderer/shell/AppShell.module.css";
import titleStyles from "../../apps/desktop/src/renderer/shell/TitleBar.module.css";

const account: AccountSummary = {
  id: "analytics-a",
  nickname: "分析测试",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
const denseRealtime = new URLSearchParams(location.search).has("realtime");
const periodPreview = new URLSearchParams(location.search).has("period");
const resourceNames =
  denseRealtime || new URLSearchParams(location.search).has("dense")
    ? Array.from(
        { length: denseRealtime ? 110 : 18 },
        (_, index) =>
          `测试资源 ${index + 1} · ${index % 3 === 0 ? "奇幻世界与装备拓展包超长名称版本" : "生存冒险扩展"}`,
      )
    : ["分析资源甲", "分析资源乙"];
const works: WorkSummary[] = resourceNames.map((name, index) => ({
  itemId: String(index + 1),
  name,
  status: "online",
  price: 100,
  priceType: "diamond",
  isOriginal: true,
  syncPc: false,
  isPrerequisite: false,
  weakOffline: false,
  weakOfflineReason: null,
  createTime: "2026-01-01",
  applyReviewTime: null,
  onlineTime: "2026-01-01",
}));
let activeAccount = account.id;
let failure = false;
let calls = 0;
const realtimeRequests: { date: string; resourceIds: string[] }[] = [];
Object.assign(globalThis, { __realtimeRequests: realtimeRequests });

/** Sparse fixture rows expose missing-day and missing-peer rendering */
function record(resourceId: string, date: string): AnalyticsRecord {
  return {
    resourceId,
    name: works.find((work) => work.itemId === resourceId)?.name ?? resourceId,
    date,
    downloads: 30,
    diamonds: 1234,
    emeralds: 0,
    purchases: 12,
    favorites: 0,
    rating: 4.2,
    peers: { downloads: null, diamonds: 1000, emeralds: null, purchases: 10, favorites: 0, rating: null },
  };
}

/** Mock only the bridge; production components still execute their real query lifecycle */
const rpc: GlazeBridge["rpc"] = async (method, params) => {
  const callAccount = activeAccount;
  const shouldFail = failure;
  const counter = document.getElementById("calls");
  calls++;
  if (counter) counter.textContent = `请求数：${calls}`;
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (shouldFail) return { ok: false, error: { kind: "network", message: "离线测试失败" } };
  let value: unknown;
  if (method === "works.list") value = callAccount === account.id ? (params as { platform?: string } | undefined)?.platform === "pc" ? works.slice(0, 1).map(work => ({ ...work, itemId: "900", name: "PC 独立资源" })) : works : [];
  else if (method === "analytics.daily" || method === "analytics.periodIncome") {
    const query = params as { resourceIds: string[]; startDate: string; endDate: string; platform?: string };
    value = periodPreview
      ? Array.from(
          { length: Math.round((Date.parse(query.endDate) - Date.parse(query.startDate)) / 86_400_000) + 1 },
          (_, day) => {
            const date = new Date(Date.parse(query.startDate) + day * 86_400_000).toISOString().slice(0, 10);
            return query.resourceIds
              .filter((_, index) => !(day === 1 && index === 0))
              .map((id, index) => ({
                ...record(id, date),
                diamonds: day === 0 ? 0 : (day + 1) * (index + 1) * 12,
                emeralds: index % 3 === 0 ? day * 5 : 0,
              }));
          },
        ).flat()
      : query.resourceIds.map((id) => record(id, query.startDate));
    if (method === "analytics.periodIncome") {
      const records = value as AnalyticsRecord[];
      const sales = new Map<string, number>();
      for (const row of records)
        sales.set(row.resourceId, (sales.get(row.resourceId) ?? 0) + (row.diamonds ?? 0) * (1 - (row.refundRate ?? 0)));
      value = { records, estimate: records.length && query.platform !== "pc" ? estimateProfit([...sales.values()]) : null };
    }
  } else if (method === "analytics.monthly") {
    const query = params as { startDate: string };
    value = callAccount === account.id ? [record("1", query.startDate.slice(0, 7))] : [];
  } else if (method === "analytics.realtime") {
    const query = params as { date: string; resourceIds: string[] };
    realtimeRequests.push(query);
    if (new URLSearchParams(location.search).has("slow-yesterday") && query.date !== new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date())) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    const retry = query.resourceIds.length < works.length;
    value = denseRealtime
      ? {
          queriedAt: new Date().toISOString(),
          resources: works.filter((work, index) => query.resourceIds.includes(work.itemId) && (retry || index >= 25)).map((work, index) => {
            const count = index === 0 ? 43 : index % 12 === 0 ? 1 : 0;
            return {
              resourceId: work.itemId,
              diamonds: count * 100,
              emeralds: 0,
              purchases: count,
              orders: Array.from({ length: count }, (_, orderIndex) => ({
                id: `order-${work.itemId}-${orderIndex}`,
                resourceId: work.itemId,
                time: `${query.date}T01:${String(orderIndex).padStart(2, "0")}:00Z`,
                currency: orderIndex % 2 === 0 ? "unknown" : "diamond",
                amount: 100,
                refundStatus: "none",
              })),
            };
          }),
          failedResourceIds: retry ? [] : works.slice(0, 25).map((work) => work.itemId),
          failures: retry ? [] : works.slice(0, 25).map((work) => ({ resourceId: work.itemId, kind: "timeout", message: "网易平台响应超时，请稍后重试" })),
        }
      : {
          resources: [
            {
              resourceId: "1",
              diamonds: 150,
              emeralds: 0,
              purchases: 4,
              orders: [
                {
                  id: "real-order-fixture",
                  resourceId: "1",
                  time: `${query.date}T01:00:00Z`,
                  currency: "diamond",
                  amount: 100,
                  refundStatus: "refunding",
                },
              ],
            },
          ],
          failedResourceIds: ["2"],
        };
  } else return { ok: false, error: { kind: "fixture", message: `未定义的接口 ${method}` } };
  return { ok: true, value } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};
const accountListeners = new Set<() => void>();
Object.assign(globalThis, {
  glaze: {
    rpc,
    on: (_event: string, listener: () => void) => {
      accountListeners.add(listener);
      return () => accountListeners.delete(listener);
    },
  },
});
applyTheme(oreUi);

/** Visible controls exercise failure recovery and account changes without real credentials */
function Preview() {
  const [current, setCurrent] = useState(account);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(true);
  return (
    <SessionProvider value={{ current, accounts: [current] }}>
      <div style={{ padding: 12, display: "flex", gap: 24 }}>
        <button
          type="button"
          onClick={() => {
            failure = !failure;
            setFailed(failure);
          }}
        >
          {failed ? "恢复请求" : "模拟请求失败"}
        </button>
        <button
          type="button"
          onClick={() => {
            activeAccount = current.id === account.id ? "analytics-b" : account.id;
            setCurrent({ ...account, id: activeAccount });
            for (const listener of accountListeners) listener();
          }}
        >
          切换测试账号
        </button>
        <output id="calls">请求数：0</output>
        <button type="button" onClick={() => setShown((value) => !value)}>
          {shown ? "离开分析页" : "返回分析页"}
        </button>
      </div>
      {shown && <AnalyticsPage />}
    </SessionProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing preview root");
createRoot(container).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("shell") ? (
      <div className={shellStyles.shell}>
        <header className={titleStyles.bar} data-testid="titlebar">Glaze MC Dev Manager</header>
        <div className={shellStyles.body}>
          <aside data-testid="sidebar" style={{ width: 216, flex: "none", background: "var(--g-surface-sidebar)" }}>数据分析</aside>
          <main className={shellStyles.main}><Preview /></main>
        </div>
      </div>
    ) : <Preview />}
  </StrictMode>,
);
