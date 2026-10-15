import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: string;
  /** What to try next, e.g. "调整筛选条件" */
  hint?: string | undefined;
}

/** Centered placeholder that fills the box it sits in */
export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <strong className={styles.title}>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}
