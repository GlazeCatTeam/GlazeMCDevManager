import type { ReactNode } from "react";
import styles from "./SettingRow.module.css";

export interface SettingGroupProps {
  title: string;
  /** Shown after the title, e.g. a count */
  note?: string | undefined;
  children: ReactNode;
}

/** Titled group of setting rows */
export function SettingGroup({ title, note, children }: SettingGroupProps) {
  return (
    <section className={styles.group} aria-label={title}>
      <h3 className={styles.groupTitle}>
        {title}
        {note && <span>{note}</span>}
      </h3>
      {children}
    </section>
  );
}

export interface SettingRowProps {
  title: string;
  description: string;
  /** The control on the right: a switch, segmented control or button */
  children: ReactNode;
}

/** One setting: title and description on the left, its control on the right */
export function SettingRow({ title, description, children }: SettingRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.copy}>
        <span className={styles.title}>{title}</span>
        <span className={styles.description}>{description}</span>
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}
