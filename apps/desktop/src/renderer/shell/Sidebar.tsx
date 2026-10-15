import { type AccountSummary, remoteImageUrl, type SessionStatus } from "@glaze/contracts";
import { Avatar, avatarColorsFor, Icon } from "@glaze/ui";
import type { NavEntry } from "./nav";
import styles from "./Sidebar.module.css";

const accountRoute = "glaze.account/account";

const navigationSections = [
  { label: "首页", routes: ["glaze.home/home"] },
  { label: "作品与玩家", routes: ["glaze.works/works", "glaze.community/feedback", "glaze.community/comments"] },
  { label: "数据与收益", routes: ["glaze.analytics/analytics", "glaze.income/income"] },
];
const sectionRoutes = new Set(navigationSections.flatMap((section) => section.routes));

const statusLabels: Record<SessionStatus, string> = {
  active: "会话有效",
  offline: "离线 · 网络异常",
  expired: "登录已过期",
};

export interface SidebarProps {
  entries: NavEntry[];
  activeRoute: string;
  account: AccountSummary | null;
  onNavigate: (route: string) => void;
}

/** Group workbench navigation by task, with account management anchored below */
export function Sidebar({ entries, activeRoute, account, onNavigate }: SidebarProps) {
  const accountActive = activeRoute === accountRoute;
  const topEntries = entries.filter((entry) => entry.group === "top");
  const sections = navigationSections.map((section) => ({
    label: section.label,
    entries: section.routes.flatMap((route) => topEntries.filter((entry) => entry.route === route)),
  }));
  sections.push({ label: "其他功能", entries: topEntries.filter((entry) => !sectionRoutes.has(entry.route)) });

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
      >
        {entry.icon && <Icon name={entry.icon} size={20} />}
        {entry.title}
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
