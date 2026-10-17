import { type HostQuery, TextButton } from "@glaze/plugin-sdk";
import { type ReactNode, useEffect, useRef } from "react";
import styles from "./QueryState.module.css";

/** Refresh the active query without discarding its filters */
export function useRefresh(reload: () => void, version: number): void {
  const previous = useRef(version);
  useEffect(() => {
    if (previous.current !== version) {
      previous.current = version;
      reload();
    }
  }, [reload, version]);
}

/** Reserve a quiet status row so refreshes never push the chart or filters down */
export function QueryState({
  query,
  label = "数据",
  scopeLabel,
}: {
  query: Pick<HostQuery<unknown>, "loading" | "error" | "reload" | "data"> & { previous?: boolean };
  label?: string;
  scopeLabel?: string;
}) {
  const message = query.loading
    ? "正在查询平台数据…"
    : query.error
      ? `${label}加载失败：${query.error.message}${query.data !== null ? ` · 已保留${query.previous ? ` ${scopeLabel ?? "上次成功结果"}` : "上次成功结果"}` : ""}`
      : query.data !== null
        ? "已更新 · 筛选自动生效"
        : "";
  return (
    <div
      className={`${styles.status} ${query.loading ? styles.busy : ""} ${query.error ? styles.failed : ""}`}
      role="status"
      aria-live="polite"
    >
      {message && <span className={styles.indicator} aria-hidden="true" />}
      <span className={styles.message} title={message}>
        {message}
      </span>
      {query.error && !query.loading && (
        <TextButton tone="warning" onClick={query.reload}>
          重试
        </TextButton>
      )}
    </div>
  );
}

/** Hide pending results while preserving mounted chart and table state */
export function QueryContent({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <div className={styles.content} hidden={loading}>
      {children}
    </div>
  );
}

/** Hold the content footprint during queries without presenting old or invented values */
export function QuerySkeleton({
  loading,
  stats = true,
  chart = true,
}: {
  loading: boolean;
  stats?: boolean;
  chart?: boolean;
}) {
  if (!loading) return null;
  return (
    <section className={styles.placeholder} aria-label="正在加载分析内容" aria-busy="true">
      {stats && (
        <div className={styles.stats} aria-hidden="true">
          {[0, 1, 2].map((id) => (
            <div key={id}>
              <span className={styles.line} />
              <span className={styles.line} />
            </div>
          ))}
        </div>
      )}
      {chart && (
        <div className={styles.chart} aria-hidden="true">
          <span className={styles.line} />
          <div className={styles.plot} />
        </div>
      )}
      <div className={styles.table} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((id) => (
          <span key={id} className={styles.line} />
        ))}
      </div>
    </section>
  );
}
