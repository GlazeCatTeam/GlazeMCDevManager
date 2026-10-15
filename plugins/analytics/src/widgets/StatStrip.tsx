import styles from "./StatStrip.module.css";

export interface StatItem {
  label: string;
  value: string;
  note: string;
}

/** Fixed-height row of headline numbers, aligned with the home overview strip */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className={styles.strip}>
      {items.map((item) => (
        <div className={styles.stat} key={item.label}>
          <span className={styles.label}>{item.label}</span>
          <strong className={styles.value}>{item.value}</strong>
          <span className={styles.note}>{item.note}</span>
        </div>
      ))}
    </div>
  );
}
