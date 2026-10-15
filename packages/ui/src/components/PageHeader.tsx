import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

export interface PageHeaderProps {
  title: ReactNode;
  /** One-line summary under the title, e.g. "共 12 条消息 · 未读 3" */
  subtitle?: ReactNode;
  /** Page-level actions on the right, usually buttons */
  actions?: ReactNode;
}

/** Page title row: title and summary on the left, page actions on the right */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle !== undefined && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
