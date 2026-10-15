import {
  Button,
  callHost,
  Dialog,
  EmptyState,
  type LogPage,
  type LogQuery,
  Notice,
  onHostEvent,
  SegmentedControl,
  TextButton,
} from "@glaze/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import styles from "./LogsSection.module.css";
import sections from "./Sections.module.css";

const levels = [
  { value: "all", label: "全部" },
  { value: "info", label: "信息" },
  { value: "warn", label: "警告" },
  { value: "error", label: "错误" },
] as const;
const labels = { info: "信息", warn: "警告", error: "错误" };

/** View, filter and export real redacted logs, with confirmation before clearing local files */
export function LogsSection() {
  const [level, setLevel] = useState<LogQuery["level"]>("all");
  const [page, setPage] = useState<LogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [revision, setRevision] = useState(0);
  const writing = useRef(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onHostEvent("logs.changed", () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setRevision((value) => value + 1), 150);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision reloads the current log filter
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void callHost("logs.list", { level })
      .then((result) => {
        if (!active) return;
        if (!result.ok) throw new Error(result.error.message);
        setPage(result.value);
      })
      .catch((reason: unknown) => {
        if (active) {
          setPage(null);
          setError(reason instanceof Error ? reason.message : "日志读取失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [level, revision]);

  /** Serialize file operations and report cancellation, failures and successful completion distinctly */
  const action = async (kind: "export" | "clear" | "openFolder") => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setStatus("");
    try {
      if (kind === "export") {
        const result = await callHost("logs.export", { level });
        if (!result.ok) throw new Error(result.error.message);
        setStatus(result.value.cancelled ? "已取消导出。" : `已导出 ${result.value.count} 条运行日志。`);
      } else {
        const result = await callHost(kind === "clear" ? "logs.clear" : "logs.openFolder");
        if (!result.ok) throw new Error(result.error.message);
        setStatus(kind === "clear" ? "本地运行日志已清除。" : "已打开日志文件夹。");
      }
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "日志操作失败，请重试");
    } finally {
      if (kind === "clear") {
        setConfirm(false);
        setRevision((value) => value + 1);
      }
      writing.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={sections.stack}>
      <div className={sections.toolbar}>
        <SegmentedControl
          label="日志级别"
          options={levels}
          value={level}
          onChange={(value) => {
            setPage(null);
            setLevel(value);
          }}
        />
        <div className={sections.actions}>
          <Button size="xs" disabled={loading || busy} onClick={() => setRevision((value) => value + 1)}>
            刷新
          </Button>
          <Button size="xs" disabled={loading || busy || !page?.entries.length} onClick={() => void action("export")}>
            导出
          </Button>
        </div>
      </div>
      {error && (
        <Notice action={<Button onClick={() => setRevision((value) => value + 1)}>重试</Button>}>{error}</Notice>
      )}
      <section className={styles.list} aria-label="运行日志记录" aria-busy={loading}>
        {page?.entries.map((entry) => (
          <div className={styles.entry} key={entry.id}>
            <time className={styles.time} dateTime={entry.time}>
              {new Date(entry.time).toLocaleString("zh-CN", { hour12: false })}
            </time>
            <span className={`${styles.level} ${styles[entry.level]}`}>{labels[entry.level]}</span>
            <span>
              [{entry.source}] {entry.message}
            </span>
          </div>
        ))}
        {!error && !page?.entries.length && <EmptyState title={loading ? "正在读取日志…" : "没有符合条件的运行日志"} />}
      </section>
      <div className={sections.toolbar}>
        <span className={sections.muted}>
          最近 {page?.entries.length ?? 0} 条{page?.truncated ? " · 仅显示当前级别最新 500 条" : ""} · 保留 14 天
        </span>
        <div className={sections.actions}>
          <Button size="xs" disabled={busy} onClick={() => void action("openFolder")}>
            打开文件夹
          </Button>
          <TextButton tone="danger" disabled={busy} onClick={() => setConfirm(true)}>
            清除日志
          </TextButton>
        </div>
      </div>
      <div className={sections.muted} role="status">
        {status}
      </div>
      {confirm && (
        <Dialog
          title="清除本地运行日志？"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setConfirm(false)}>
                取消
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void action("clear")}>
                {busy ? "正在清除…" : "确认清除"}
              </Button>
            </>
          }
        >
          将删除应用保留的全部运行日志（包括其他级别和日期），此操作无法撤销。
        </Dialog>
      )}
    </div>
  );
}
