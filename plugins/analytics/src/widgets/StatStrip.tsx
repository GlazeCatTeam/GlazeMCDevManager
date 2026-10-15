import type { ReactNode } from "react";
import styles from "./StatStrip.module.css";

export interface StatItem {
  label: string;
  value: string;
  note: string;
  icon?: ReactNode;
  detail?: string;
}

/** Headline numbers with optional currency icons and an aligned secondary amount */
export function StatStrip({ items }: { items: StatItem[] }) {
  const hasDetails = items.some((item) => item.detail);
  return (
    <div className={styles.strip}>
      {items.map((item) => (
        <div className={styles.stat} key={item.label}>
          <span className={styles.label}>{item.label}</span>
          <strong className={styles.value}>
            {item.icon}
            {item.value}
          </strong>
          {hasDetails && (
            <span className={styles.detail} aria-hidden={!item.detail || undefined}>
              {item.detail}
            </span>
          )}
          <span className={styles.note}>{item.note}</span>
        </div>
      ))}
    </div>
  );
}
