import { Button, PageHeader, useSession } from "@glaze/plugin-sdk";
import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import styles from "./AnalyticsPage.module.css";
import { workResources } from "./data";
import { QuerySkeleton, QueryState } from "./QueryState";
import { useAnalysisPreference } from "./useAnalysisPreference";
import { AnalysisActivity, useAnalyticsQuery } from "./useAnalyticsQuery";
import { ModuleView } from "./views/ModuleView";
import { PeriodIncomeView } from "./views/PeriodIncomeView";
import { RealtimeView } from "./views/RealtimeView";
import { SummaryView } from "./views/SummaryView";
import { TrackingView } from "./views/TrackingView";

const tabs = [
  { id: "tracking", label: "数据追踪" },
  { id: "summary", label: "数据汇总" },
  { id: "module", label: "模组分析" },
  { id: "period", label: "周期收益" },
  { id: "realtime", label: "实时收益" },
] as const;
type Tab = (typeof tabs)[number]["id"];

/** Index of the tab a key moves to, or undefined when the key does not move focus */
function targetIndex(key: string, index: number): number | undefined {
  const moves: Record<string, number> = {
    ArrowRight: (index + 1) % tabs.length,
    ArrowLeft: (index - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  };
  return moves[key];
}

/** Analytics tabs share account scope while keeping each view's filters */
export function AnalyticsPage() {
  const { current } = useSession();
  if (!current) return <p>请先登录开发者账号</p>;
  return <AccountAnalytics key={`${current.id}:${current.lastLoginAt}`} />;
}

/** Keep resource selections and responses scoped to the current account */
function AccountAnalytics() {
  const [tab, setTab] = useAnalysisPreference<Tab>(
    "tab",
    "tracking",
    tabs.map((item) => item.id),
  );
  const [visited, setVisited] = useState<Tab[]>([tab]);
  const [refreshVersions, setRefreshVersions] = useState<Record<Tab, number>>({
    tracking: 0,
    summary: 0,
    module: 0,
    period: 0,
    realtime: 0,
  });
  const needsResources = tab === "tracking" || tab === "module" || tab === "realtime";
  const works = useAnalyticsQuery("works.list", undefined, needsResources);
  const resources = useMemo(() => workResources(works.data ?? []), [works.data]);

  /** Keep visited tabs mounted; their query hooks revalidate when they become visible again */
  const selectTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setVisited((current) => (current.includes(next) ? current : [...current, next]));
  };

  /** Reload the actual resource list and the active analysis */
  const refresh = () => {
    if (tab !== "period" && tab !== "summary") works.reload();
    setRefreshVersions((current) => ({ ...current, [tab]: current[tab] + 1 }));
  };

  /** Arrow keys, Home and End move between tabs like a standard tablist */
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = tabs[targetIndex(event.key, index) ?? -1];
    if (!next) {
      return;
    }
    event.preventDefault();
    selectTab(next.id);
    document.getElementById(`analytics-tab-${next.id}`)?.focus({ preventScroll: true });
  };

  // Mount on first visit, then reuse the loaded result until refresh or a filter change
  const views: Record<Tab, ReactNode> = {
    tracking: <TrackingView resources={resources} refreshVersion={refreshVersions.tracking} />,
    summary: <SummaryView refreshVersion={refreshVersions.summary} />,
    module: <ModuleView resources={resources} refreshVersion={refreshVersions.module} />,
    period: <PeriodIncomeView refreshVersion={refreshVersions.period} />,
    realtime: <RealtimeView resources={resources} refreshVersion={refreshVersions.realtime} />,
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="数据分析"
        subtitle={
          tab === "period"
            ? "PC / PE 周期收益独立统计 · 北京时间"
            : "多维度了解你的作品表现 · 曾上架的手游资源 · 北京时间"
        }
        actions={<Button onClick={refresh}>刷新</Button>}
      />
      {tab !== "period" && tab !== "summary" && (works.loading || works.error) && (
        <div className={styles.resourceStatus}>
          <QueryState query={works} label="资源列表" />
        </div>
      )}
      {tab !== "period" && tab !== "summary" && !works.loading && !works.error && resources.length === 0 && (
        <p>当前账号暂无可分析的手游资源；仅展示曾上架且不是前置模组的作品</p>
      )}
      <div className={styles.tabs} role="tablist" aria-label="分析功能">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            id={`analytics-tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`analytics-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? `${styles.tab} ${styles.active}` : styles.tab}
            onClick={() => selectTab(item.id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tabs.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`analytics-panel-${item.id}`}
          aria-labelledby={`analytics-tab-${item.id}`}
          hidden={tab !== item.id}
          className={styles.workspace}
        >
          {tab === item.id && item.id !== "summary" && item.id !== "period" && (
            <QuerySkeleton
              loading={works.loading && works.data === null}
              stats={item.id !== "tracking"}
              chart={item.id !== "realtime"}
            />
          )}
          {visited.includes(item.id) &&
            (item.id === "summary" || item.id === "period" || (works.data && resources.length > 0)) && (
              <AnalysisActivity.Provider value={tab === item.id}>{views[item.id]}</AnalysisActivity.Provider>
            )}
        </div>
      ))}
    </div>
  );
}
