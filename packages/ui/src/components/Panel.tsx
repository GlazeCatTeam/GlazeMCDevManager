import type { ReactNode } from "react";
import styles from "./Panel.module.css";

export interface PanelProps {
  title?: ReactNode;
  /** Shown before the title, usually an <Icon /> */
  icon?: ReactNode;
  /** Shown right after the title, e.g. a <Tag /> */
  badge?: ReactNode;
  /** Right side of the header */
  actions?: ReactNode;
  "aria-label"?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
}

/** Single-layer content panel with an optional header row */
export function Panel({ title, icon, badge, actions, className, children, ...rest }: PanelProps) {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section className={className ? `${styles.panel} ${className}` : styles.panel} aria-label={rest["aria-label"]}>
      {hasHeader && (
        <div className={styles.header}>
          <span className={styles.heading}>
            {icon}
            {title !== undefined && <span className={styles.title}>{title}</span>}
            {badge}
          </span>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
