import { Button } from "@glaze/plugin-sdk";
import { type KeyboardEvent, useState } from "react";
import styles from "./AnalyticsPage.module.css";
import { ModuleView } from "./ModuleView";
import { RealtimeView } from "./RealtimeView";
import { SummaryView } from "./SummaryView";
import { TrackingView } from "./TrackingView";

const tabs = [
  { id: "tracking", label: "数据追踪" },
  { id: "summary", label: "数据汇总" },
  { id: "module", label: "模组分析" },
  { id: "realtime", label: "实时收益" },
] as const;
type Tab = (typeof tabs)[number]["id"];

/** Four analytics workspaces using the approved Ore layout and local preview data */
export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("tracking");
  const [refreshVersion, setRefreshVersion] = useState(0);

  /** Move between analysis tabs with the standard tablist keyboard shortcuts */
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + direction + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if ((!direction && event.key !== "Home" && event.key !== "End") || !next) {
      return;
    }
    event.preventDefault();
    setTab(next.id);
    document.getElementById(`analytics-tab-${next.id}`)?.focus();
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>数据分析</h1>
          <span className={styles.subtitle}>多维度了解你的作品表现 · 网易平台</span>
        </div>
        <div className={styles.refresh}>
          <span className={styles.refreshNote} role="status">
            {refreshVersion > 0 ? "已重新查询平台数据" : ""}
          </span>
          <Button onClick={() => setRefreshVersion((value) => value + 1)}>刷新</Button>
        </div>
      </div>
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
            className={tab === item.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
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
          {tab === item.id && item.id === "tracking" && <TrackingView refreshVersion={refreshVersion} />}
          {tab === item.id && item.id === "summary" && <SummaryView key={refreshVersion} />}
          {tab === item.id && item.id === "module" && <ModuleView key={refreshVersion} />}
          {tab === item.id && item.id === "realtime" && <RealtimeView key={refreshVersion} />}
        </div>
      ))}
    </div>
  );
}
