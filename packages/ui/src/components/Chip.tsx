import type { ReactNode } from "react";
import styles from "./Chip.module.css";

export interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Unread or pending count shown as a small badge; hidden when zero */
  count?: number | undefined;
}

/** Outlined filter chip; green when selected. Works for single and multiple selection */
export function Chip({ selected, onClick, children, count }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={selected ? `${styles.chip} ${styles.selected}` : styles.chip}
      onClick={onClick}
    >
      {children}
      {count !== undefined && count > 0 && <span className={styles.count}>{count}</span>}
    </button>
  );
}
