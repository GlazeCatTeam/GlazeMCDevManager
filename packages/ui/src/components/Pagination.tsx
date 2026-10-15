import styles from "./Pagination.module.css";

export interface PaginationProps {
  /** Zero-based current page */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Shown after the page count, e.g. "每页 9 个" */
  note?: string | undefined;
}

/** Previous / page numbers / next; hidden when there is only one page */
export function Pagination({ page, pageCount, onChange, note }: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }
  const go = (target: number) => onChange(Math.max(0, Math.min(pageCount - 1, target)));

  return (
    <nav aria-label="分页" className={styles.pagination}>
      <button type="button" className={styles.button} disabled={page === 0} onClick={() => go(page - 1)}>
        ‹ 上一页
      </button>
      {Array.from({ length: pageCount }, (_, index) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: page numbers are the identity here
          key={index}
          type="button"
          className={index === page ? `${styles.button} ${styles.current}` : styles.button}
          aria-current={index === page ? "page" : undefined}
          aria-label={`第 ${index + 1} 页`}
          onClick={() => go(index)}
        >
          {index + 1}
        </button>
      ))}
      <button type="button" className={styles.button} disabled={page === pageCount - 1} onClick={() => go(page + 1)}>
        下一页 ›
      </button>
      <span className={styles.summary}>
        第 {page + 1} / {pageCount} 页{note ? ` · ${note}` : ""}
      </span>
    </nav>
  );
}
