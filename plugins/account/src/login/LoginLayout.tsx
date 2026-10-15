import { Icon, useNavigation } from "@glaze/plugin-sdk";
import type { ReactNode } from "react";
import { routes } from "../routes";
import styles from "./LoginLayout.module.css";

// Shown in the footer until the app reports its real version
const APP_VERSION = "v0.1.0";

/** Full-window frame shared by the login pages: centered column, settings shortcut, footer and grass strip */
export function LoginLayout({ children }: { children: ReactNode }) {
  const { navigate } = useNavigation();

  return (
    <div className={styles.layout}>
      <button type="button" className={styles.settings} aria-label="设置" onClick={() => navigate(routes.settings)}>
        <Icon name="nav.settings" size={18} />
      </button>

      <div className={styles.column}>{children}</div>

      <footer className={styles.footer}>
        <div className={styles.links}>
          {/* TODO: open help pages in the system browser once the shell exposes it */}
          <button type="button" className={styles.link}>
            如何获取 Cookie
          </button>
          <button type="button" className={styles.link}>
            隐私与安全
          </button>
          <span>{APP_VERSION}</span>
        </div>
        <div className={styles.grass} aria-hidden="true" />
        <div className={styles.dirt} aria-hidden="true" />
      </footer>
    </div>
  );
}
