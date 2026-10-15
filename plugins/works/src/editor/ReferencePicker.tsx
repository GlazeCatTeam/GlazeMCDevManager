import { Button, callHost, Notice, TextButton, type WorkReference, type WorkSearchParams } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import styles from "./WorkEditor.module.css";

/** Search one audited reference pool and discard stale replies when the query changes */
export function ReferencePicker({
  account,
  itemId,
  kind,
  label,
  selected,
  multiple = false,
  disabled,
  onChange,
}: {
  account: string;
  itemId: string;
  kind: WorkSearchParams["kind"];
  label: string;
  selected: WorkReference[];
  multiple?: boolean;
  disabled: boolean;
  onChange: (items: WorkReference[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<WorkReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    void revision;
    let cancelled = false;
    setFound([]);
    setError("");
    setLoading(false);
    if (disabled || !query.trim()) return;
    setLoading(true);
    const timer = setTimeout(() => {
      void callHost("works.searchReferences", { account, kind, query })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setFound(result.value.filter((item) => kind === "pcPrerequisite" || item.itemId !== itemId));
          else setError(result.error.message);
        })
        .catch(() => {
          if (!cancelled) setError("搜索失败，请重试");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [account, kind, itemId, query, disabled, revision]);
  return (
    <div className={styles.stack}>
      <span className={styles.label}>
        {label}
        {multiple ? "（多选）" : "（单选）"}
      </span>
      {selected.map((item) => (
        <div className={styles.file} key={item.itemId}>
          <span>
            {item.name} <small>{item.itemId}</small>
          </span>
          <TextButton
            disabled={disabled}
            tone="danger"
            onClick={() => onChange(selected.filter((v) => v.itemId !== item.itemId))}
          >
            移除
          </TextButton>
        </div>
      ))}
      <input
        className={styles.input}
        aria-label={`搜索${label}`}
        placeholder="输入名称搜索"
        value={query}
        disabled={disabled}
        maxLength={100}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <span role="status">正在搜索…</span>}
      {error && (
        <Notice action={<TextButton onClick={() => setRevision((v) => v + 1)}>重试</TextButton>}>{error}</Notice>
      )}
      {!loading && !error && query.trim() && !found.length && <span className={styles.hint}>未找到匹配模组</span>}
      {found.map((item) => (
        <div className={styles.file} key={item.itemId}>
          <span>{item.name}</span>
          <Button
            size="xs"
            disabled={disabled || selected.some((v) => v.itemId === item.itemId)}
            onClick={() => onChange(multiple ? [...selected, item] : [item])}
          >
            {selected.some((v) => v.itemId === item.itemId) ? "已选择" : "选择"}
          </Button>
        </div>
      ))}
    </div>
  );
}
