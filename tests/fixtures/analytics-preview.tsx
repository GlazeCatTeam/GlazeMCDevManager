import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AccountSummary, AnalyticsRecord, GlazeBridge, WorkSummary } from "../../packages/contracts/src";
import { allocatePePeriodIncome } from "../../packages/netease/src/income/period-allocation";
import { NavigationProvider, type RouteParams, SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import analyticsPlugin from "../../plugins/analytics/src";
import { AnalyticsPage } from "../../plugins/analytics/src/AnalyticsPage";
import { WorksPage } from "../../plugins/works/src/WorksPage";
import fluentDark from "../../themes/fluent-dark/theme.json";
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
const worksPreview = new URLSearchParams(location.search).has("works");
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
if (worksPreview && works[0])
  works.push({ ...works[0], itemId: "3", name: "未上架资源", status: "init", onlineTime: null });
let activeAccount = account.id;
let failure = false;
let calls = 0;
const realtimeRequests: { date: string; endDate?: string; resourceIds: string[] }[] = [];
const requests: { method: string; params: unknown }[] = [];
const controls = { delay: 400, failureKind: "network", unavailableMonths: [] as string[] };
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
    activeUsers: Number(resourceId) * 10,
    refundRate: Number(resourceId) / 1000,
    playtime: 12.5 + Number(resourceId),
    peers: {
      downloads: null,
      diamonds: 1000,
      emeralds: null,
      purchases: 10,
      favorites: 0,
      rating: null,
      activeUsers: null,
      refundRate: null,
      playtime: null,
    },
  };
}

/** Mock only the bridge; production components still execute their real query lifecycle */
const rpc: GlazeBridge["rpc"] = async (method, params) => {
  const callAccount = activeAccount;
  const shouldFail = failure;
  const failureKind = controls.failureKind;
  requests.push({ method, params });
  const counter = document.getElementById("calls");
  calls++;
  if (counter) counter.textContent = `请求数：${calls}`;
  await new Promise((resolve) => setTimeout(resolve, controls.delay));
  if (shouldFail) return { ok: false, error: { kind: failureKind, message: "离线测试失败" } };
  let value: unknown;
  if (method === "works.page") {
    const { page, pageSize } = params as { page: number; pageSize: number };
    value = { items: works.slice(page * pageSize, (page + 1) * pageSize), total: works.length };
  } else if (method === "works.get") {
    const work = works.find((item) => item.itemId === (params as { itemId: string }).itemId);
    value = {
      itemId: work?.itemId,
      iconUrl: null,
      bannerUrl: null,
      onlineTime: work?.onlineTime,
      appointOnlineTime: null,
    };
  } else if (method === "works.list")
    value =
      callAccount === account.id
        ? (params as { platform?: string } | undefined)?.platform === "pc"
          ? works.slice(0, 1).map((work) => ({ ...work, itemId: "900", name: "PC 独立资源" }))
          : works
        : [];
  else if (method === "analytics.daily" || method === "analytics.periodIncome") {
    const query = params as {
      resourceIds: string[];
      startDate: string;
      endDate: string;
      platform?: string;
      settlementMonth?: string;
      allResources?: boolean;
      includePeers?: boolean;
    };
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
    if (method === "analytics.daily" && !query.includePeers) {
      value = (value as AnalyticsRecord[]).map((item) => ({ ...item, favorites: null }));
    }
    if (method === "analytics.periodIncome") {
      const records = value as AnalyticsRecord[];
      const month = query.settlementMonth ?? query.endDate.slice(0, 7);
      const previous = new Date(`${month}-01T00:00:00Z`);
      previous.setUTCMonth(previous.getUTCMonth() - 1);
      const provisional = new URLSearchParams(location.search).has("pending-month");
      const dailySales = new Map<string, number>();
      for (const row of records)
        dailySales.set(row.resourceId, (dailySales.get(row.resourceId) ?? 0) + (row.diamonds ?? 0));
      const sales = provisional
        ? [...dailySales.values()]
        : query.allResources
          ? [300000, 100000, 200]
          : query.resourceIds.map(() => 100000);
      value = {
        records,
        estimate:
          query.platform === "pc"
            ? null
            : {
                ...allocatePePeriodIncome(
                  sales.map((diamonds, index) => ({
                    resourceId: provisional ? ([...dailySales.keys()][index] ?? "") : String(index + 1),
                    name: works[index]?.name ?? "历史模组",
                    diamonds,
                  })),
                  0.34,
                ),
                month,
                startDate: provisional ? query.startDate : `${month}-01`,
                endDate: query.endDate,
                source: provisional ? "pe-period-daily" : "pe-monthly",
                costRate: 0.34,
                costSourceMonth: previous.toISOString().slice(0, 7),
                works: sales.length,
                failedWorks: [],
                warnings: provisional ? ["平台月汇总尚未提供，暂按当前周期已返回的日记录估算。"] : [],
              },
      };
    }
  } else if (method === "analytics.monthly") {
    const query = params as { startDate: string; endDate: string };
    const dates: string[] = [];
    const cursor = new Date(`${query.startDate.slice(0, 7)}-01T00:00:00Z`);
    while (cursor.toISOString().slice(0, 10) <= query.endDate) {
      dates.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    value =
      callAccount === account.id
        ? dates
            .filter((month) => !controls.unavailableMonths.includes(month))
            .flatMap((month) => works.map((work) => record(work.itemId, month)))
        : [];
  } else if (method === "analytics.realtime") {
    const query = params as { date: string; endDate?: string; resourceIds: string[] };
    realtimeRequests.push(query);
    if (
      new URLSearchParams(location.search).has("slow-yesterday") &&
      query.date !== new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date())
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    const retry = query.resourceIds.length < works.length;
    value = denseRealtime
      ? {
          queriedAt: new Date().toISOString(),
          resources: works
            .filter((work, index) => query.resourceIds.includes(work.itemId) && (retry || index >= 25))
            .map((work, index) => {
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
          failures: retry
            ? []
            : works
                .slice(0, 25)
                .map((work) => ({ resourceId: work.itemId, kind: "timeout", message: "网易平台响应超时，请稍后重试" })),
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
const accountListeners = new Map<string, Set<() => void>>();
Object.assign(globalThis, {
  __analyticsTest: {
    requests,
    controls,
    clearCache: () => {
      for (const listener of accountListeners.get("cache.cleared") ?? []) listener();
    },
    theme: (name: string) => applyTheme(name === "fluent" ? fluentDark : oreUi, name === "light" ? "light" : "dark"),
  },
  glaze: {
    rpc,
    on: (event: string, listener: () => void) => {
      const listeners = accountListeners.get(event) ?? new Set<() => void>();
      listeners.add(listener);
      accountListeners.set(event, listeners);
      return () => listeners.delete(listener);
    },
  },
});
applyTheme(oreUi);

/** Exercise production work cards and the registered analytics route in one navigation session */
function WorkNavigationPreview() {
  const [location, setLocation] = useState<{ route: string; params: RouteParams }>({
    route: "glaze.works/works",
    params: {},
  });
  const Analysis = analyticsPlugin.pages?.analytics;
  return (
    <NavigationProvider value={{ ...location, navigate: (route, params = {}) => setLocation({ route, params }) }}>
      <button type="button" onClick={() => setLocation({ route: "glaze.works/works", params: {} })}>
        返回作品列表
      </button>
      {location.route === "glaze.works/works" ? <WorksPage /> : Analysis && <Analysis />}
    </NavigationProvider>
  );
}

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
            for (const listener of accountListeners.get("account.changed") ?? []) listener();
          }}
        >
          切换测试账号
        </button>
        <output id="calls">请求数：0</output>
        <button type="button" onClick={() => setShown((value) => !value)}>
          {shown ? "离开分析页" : "返回分析页"}
        </button>
      </div>
      {shown && (worksPreview ? <WorkNavigationPreview /> : <AnalyticsPage />)}
    </SessionProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing preview root");
createRoot(container).render(
  <StrictMode>
    {new URLSearchParams(location.search).has("shell") ? (
      <div className={shellStyles.shell}>
        <header className={titleStyles.bar} data-testid="titlebar">
          Glaze MC Dev Manager
        </header>
        <div className={shellStyles.body}>
          <aside data-testid="sidebar" style={{ width: 216, flex: "none", background: "var(--g-surface-sidebar)" }}>
            数据分析
          </aside>
          <main className={shellStyles.main}>
            <Preview />
          </main>
        </div>
      </div>
    ) : (
      <Preview />
    )}
  </StrictMode>,
);
