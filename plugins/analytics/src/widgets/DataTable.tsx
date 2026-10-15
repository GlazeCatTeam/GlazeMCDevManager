import type { ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface DataTableProps {
  /** Read by screen readers only */
  caption: string;
  columns: string[];
  /** Table rows; pass an empty array to show the empty message */
  rows: ReactNode[];
  emptyText: string;
}

/** Scrolling numeric table with a sticky header; the first column is left-aligned */
export function DataTable({ caption, columns, rows, emptyText }: DataTableProps) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Table note under the rows, e.g. "共 3 个资源 · 14 天" */
export function TableNote({ children }: { children: ReactNode }) {
  return (
    <span className={styles.note} role="status">
      {children}
    </span>
  );
}

/** Class for a value cell that went up */
export const positiveClass = styles.positive;

/** Class for a muted value cell such as an order ID */
export const mutedClass = styles.muted;
