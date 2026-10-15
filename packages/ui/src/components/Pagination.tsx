import { type FormEvent, useState } from "react";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  /** Zero-based current page */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Shown after the page count, e.g. "每页 9 个" */
  note?: string | undefined;
}

/** Keep boundary pages and a moving window around the current page, with direct page jumping */
export function Pagination({ page, pageCount, onChange, note }: PaginationProps) {
  const [jumpPage, setJumpPage] = useState("");

  if (pageCount <= 1) {
    return null;
  }
  const windowStart = Math.max(1, Math.min(page - 2, pageCount - 6));
  const pages =
    pageCount <= 7
      ? Array.from({ length: pageCount }, (_, index) => index)
      : [0, ...Array.from({ length: 5 }, (_, index) => windowStart + index), pageCount - 1];

  /** Keep page changes within the available range */
  const go = (target: number) => onChange(Math.max(0, Math.min(pageCount - 1, target)));

  /** Jump to a valid one-based page submitted by button or Enter */
  const handleJump = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = Number(jumpPage);
    if (!Number.isInteger(target) || target < 1 || target > pageCount) {
      return;
    }
    go(target - 1);
    setJumpPage("");
  };

  return (
    <nav aria-label="分页" className={styles.pagination}>
      <button type="button" className={styles.button} disabled={page === 0} onClick={() => go(page - 1)}>
        ‹ 上一页
      </button>
      {pages.map((index, position) => (
        <span key={index} className={styles.pageItem}>
          {index - (pages[position - 1] ?? index) > 1 && (
            <span className={styles.ellipsis} aria-hidden="true">
              …
            </span>
          )}
          <button
            type="button"
            className={index === page ? `${styles.button} ${styles.current}` : styles.button}
            aria-current={index === page ? "page" : undefined}
            aria-label={`第 ${index + 1} 页`}
            onClick={() => go(index)}
          >
            {index + 1}
          </button>
        </span>
      ))}
      <button type="button" className={styles.button} disabled={page === pageCount - 1} onClick={() => go(page + 1)}>
        下一页 ›
      </button>
      <span className={styles.summary}>
        第 {page + 1} / {pageCount} 页{note ? ` · ${note}` : ""}
      </span>
      <form className={styles.jump} onSubmit={handleJump}>
        <label className={styles.jump}>
          跳至
          <input
            className={styles.input}
            type="number"
            aria-label="跳转页码"
            min={1}
            max={pageCount}
            step={1}
            required
            value={jumpPage}
            onChange={(event) => setJumpPage(event.target.value)}
          />
          页
        </label>
        <button type="submit" className={styles.button}>
          跳转
        </button>
      </form>
    </nav>
  );
}
