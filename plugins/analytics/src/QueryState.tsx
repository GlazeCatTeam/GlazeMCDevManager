import { type HostQuery, Notice, TextButton } from "@glaze/plugin-sdk";
import { useEffect, useRef } from "react";

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

/** Loading and failure never masquerade as zero-valued platform data */
export function QueryState({ query }: { query: Pick<HostQuery<unknown>, "loading" | "error" | "reload" | "data"> }) {
  if (query.loading)
    return <p role="status">{query.data !== null ? "正在更新平台数据，当前显示上次查询结果…" : "正在查询平台数据…"}</p>;
  if (query.error)
    return (
      <Notice
        action={
          <TextButton tone="warning" onClick={query.reload}>
            重试
          </TextButton>
        }
      >
        数据加载失败：{query.error.message}
      </Notice>
    );
  return null;
}
