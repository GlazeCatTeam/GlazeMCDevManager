import { Button, PageHeader } from "@glaze/plugin-sdk";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import styles from "./AnalyticsPage.module.css";
import { ModuleView } from "./views/ModuleView";
import { RealtimeView } from "./views/RealtimeView";
import { SummaryView } from "./views/SummaryView";
import { TrackingView } from "./views/TrackingView";

const tabs = [
  { id: "tracking", label: "数据追踪" },
  { id: "summary", label: "数据汇总" },
  { id: "module", label: "模组分析" },
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

/** Analytics: four tabs (tracking, monthly summary, single module, realtime income) */
export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("tracking");
  const [refreshVersion, setRefreshVersion] = useState(0);

  /** Arrow keys, Home and End move between tabs like a standard tablist */
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = tabs[targetIndex(event.key, index) ?? -1];
    if (!next) {
      return;
    }
    event.preventDefault();
    setTab(next.id);
    document.getElementById(`analytics-tab-${next.id}`)?.focus();
  };

  // Only the active view is mounted; refreshing remounts it so it re-queries
  const views: Record<Tab, ReactNode> = {
    tracking: <TrackingView refreshVersion={refreshVersion} />,
    summary: <SummaryView key={refreshVersion} />,
    module: <ModuleView key={refreshVersion} />,
    realtime: <RealtimeView key={refreshVersion} />,
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="数据分析"
        subtitle="多维度了解你的作品表现 · 网易平台"
        actions={
          <>
            <span className={styles.refreshNote} role="status">
              {refreshVersion > 0 ? "已重新查询平台数据" : ""}
            </span>
            <Button onClick={() => setRefreshVersion((value) => value + 1)}>刷新</Button>
          </>
        }
      />
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
            onClick={() => setTab(item.id)}
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
          {tab === item.id && views[item.id]}
        </div>
      ))}
    </div>
  );
}
