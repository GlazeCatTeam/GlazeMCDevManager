import { Icon, PixelAvatar } from "@glaze/ui";
import type { MockAccount } from "../mock/session";
import type { NavEntry } from "./nav";
import styles from "./Sidebar.module.css";

export interface SidebarProps {
  entries: NavEntry[];
  activeRoute: string;
  account: MockAccount;
  onNavigate: (route: string) => void;
}

/** Side navigation: top group, bottom group, and the current account card */
export function Sidebar({ entries, activeRoute, account, onNavigate }: SidebarProps) {
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
      {entries.filter((e) => e.group === "top").map(renderItem)}
      <div className={styles.spacer} />
      {entries.filter((e) => e.group === "bottom").map(renderItem)}
      <div className={styles.account}>
        <PixelAvatar colors={account.avatar} size={28} />
        <span className={styles.accountText}>
          <span className={styles.nickname}>{account.nickname}</span>
          <span className={account.sessionValid ? styles.valid : styles.expired}>
            {account.sessionValid ? "会话有效" : "登录已过期"}
          </span>
        </span>
      </div>
    </nav>
  );
}
