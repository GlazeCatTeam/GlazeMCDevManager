import type { ReactNode } from "react";
import styles from "./Feedback.module.css";
import { Icon } from "./Icon";

/** Small outlined label, e.g. "估算"; the warning tone marks a state that needs attention */
export function Tag({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warning" }) {
  return <span className={tone === "warning" ? `${styles.tag} ${styles.tagWarning}` : styles.tag}>{children}</span>;
}

export interface NoticeProps {
  children: ReactNode;
  /** Optional inline action on the right, e.g. a retry <TextButton /> */
  action?: ReactNode;
}

/** Warning strip for partial or failed data; never let failures look like zero */
export function Notice({ children, action }: NoticeProps) {
  return (
    <div role="status" className={styles.notice}>
      <Icon name="status.warning" size={16} />
      <span className={styles.message}>{children}</span>
      {action}
    </div>
  );
}

export interface ProgressBarProps {
  /** Progress from 0 to 1 */
  value: number;
  label: string;
  className?: string | undefined;
}

/** Flat horizontal progress bar */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={className ? `${styles.track} ${className}` : styles.track}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
