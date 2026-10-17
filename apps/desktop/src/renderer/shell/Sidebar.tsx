import { type AccountSummary, remoteImageUrl, type SessionStatus } from "@glaze/contracts";
import { callHost, onHostEvent, usePrefetchHostQuery } from "@glaze/plugin-sdk";
import { Avatar, avatarColorsFor, Icon } from "@glaze/ui";
import { useEffect, useState } from "react";
import { preloadRoute } from "../routes/pages";
import { MessageUnreadDot } from "./MessageUnreadDot";
import type { NavEntry } from "./nav";
import styles from "./Sidebar.module.css";

const accountRoute = "glaze.account/account";

const OTHER_SECTION = "其他功能";

/** Group top entries by their manifest section; groups follow their first entry's order, ungrouped last */
function groupSections(entries: NavEntry[]): { label: string; entries: NavEntry[] }[] {
  const groups = new Map<string, NavEntry[]>();
  for (const entry of entries) {
    const label = entry.section ?? OTHER_SECTION;
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  const other = groups.get(OTHER_SECTION);
  groups.delete(OTHER_SECTION);
  return [
    ...[...groups].map(([label, items]) => ({ label, entries: items })),
    ...(other ? [{ label: OTHER_SECTION, entries: other }] : []),
  ];
}

const statusLabels: Record<SessionStatus, string> = {
  active: "会话有效",
  offline: "离线 · 网络异常",
  expired: "登录已过期",
};

export interface SidebarProps {
  entries: NavEntry[];
  activeRoute: string;
  account: AccountSummary | null;
  onNavigate: (route: string, params?: Record<string, string>) => void;
}

/** Group workbench navigation by task, with account management anchored below */
export function Sidebar({ entries, activeRoute, account, onNavigate }: SidebarProps) {
  const [mcp, setMcp] = useState({ requests: 0, connected: 0 });
  useEffect(() => {
    let active = true;
    let changed = false;
    const off = onHostEvent("mcp.changed", ({ requestCount, connectedCount }) => {
      changed = true;
      setMcp({ requests: requestCount, connected: connectedCount });
    });
    void callHost("mcp.snapshot")
      .then((result) => {
        if (active && !changed && result.ok)
          setMcp({
            requests: result.value.requests.length,
            connected: result.value.clients.filter((client) => client.connected).length,
          });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      off();
    };
  }, []);
  const accountActive = activeRoute === accountRoute;
  const prefetch = usePrefetchHostQuery();
  const sections = groupSections(entries.filter((entry) => entry.group === "top"));

  /** Render a route button with its current-page state */
  const renderItem = (entry: NavEntry) => {
    const active = entry.route === activeRoute;
    return (
      <button
        key={entry.route}
        type="button"
        className={active ? `${styles.item} ${styles.active}` : styles.item}
        aria-current={active ? "page" : undefined}
        onClick={() => onNavigate(entry.route)}
        onPointerEnter={() => preloadRoute(entry.route, prefetch)}
        onFocus={() => preloadRoute(entry.route, prefetch)}
      >
        {entry.icon && <Icon name={entry.icon} size={20} />}
        {entry.title}
        {entry.route === "glaze.messages/messages" && account && account.status !== "expired" && (
          <MessageUnreadDot account={account.id} />
        )}
      </button>
    );
  };

  return (
    <nav className={styles.sidebar} aria-label="功能导航">
      <div className={styles.sections}>
        {sections
          .filter((section) => section.entries.length > 0)
          .map((section) => (
            <section key={section.label} className={styles.section} aria-label={section.label}>
              {section.entries.map(renderItem)}
            </section>
          ))}
      </div>
      <div className={styles.spacer} />
      {(mcp.requests > 0 || mcp.connected > 0) && (
        <button
          type="button"
          className={mcp.requests ? `${styles.aiStatus} ${styles.aiWaiting}` : styles.aiStatus}
          onClick={() => onNavigate("glaze.assistant/assistant")}
        >
          <span className={styles.aiDot} aria-hidden />
          {mcp.requests ? `AI 等你允许 · ${mcp.requests}` : `AI 已连接 · ${mcp.connected}`}
        </button>
      )}
      <div className={styles.utilities}>{entries.filter((e) => e.group === "bottom").map(renderItem)}</div>
      {account && (
        <button
          type="button"
          className={accountActive ? `${styles.account} ${styles.active}` : styles.account}
          aria-label={`${account.nickname}，账号管理`}
          aria-current={accountActive ? "page" : undefined}
          title="账号管理"
          onClick={() => onNavigate(accountRoute)}
        >
          <Avatar src={remoteImageUrl(account.avatarUrl)} colors={avatarColorsFor(account.id)} size={28} />
          <span className={styles.accountText}>
            <span className={styles.nickname}>{account.nickname}</span>
            <span className={account.status === "active" ? styles.valid : styles.expired}>
              {statusLabels[account.status]}
            </span>
          </span>
        </button>
      )}
    </nav>
  );
}
