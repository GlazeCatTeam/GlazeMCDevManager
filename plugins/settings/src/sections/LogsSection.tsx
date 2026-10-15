import { Button, EmptyState, SegmentedControl, TextButton } from "@glaze/plugin-sdk";
import { useState } from "react";
import { exportLogs, filterLogs } from "../helpers";
import { type LogEntry, type LogLevel, logLevelLabels } from "../mock";
import styles from "./LogsSection.module.css";
import sections from "./Sections.module.css";

const levels = [
  { value: "all", label: "全部" },
  { value: "info", label: "信息" },
  { value: "warn", label: "警告" },
  { value: "error", label: "错误" },
] as const;

export interface LogsSectionProps {
  logs: LogEntry[];
  onRefresh: () => void;
  onClear: () => void;
  /** Report the result of an action in the settings status line */
  onNotice: (message: string) => void;
}

/** Sample log viewer: level filter, export of the visible records, open folder and clear */
export function LogsSection({ logs, onRefresh, onClear, onNotice }: LogsSectionProps) {
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const visible = filterLogs(logs, level);

  /** Download the visible sample records and report failures */
  const download = () => {
    try {
      exportLogs(visible);
      onNotice(`已生成 ${visible.length} 条模拟日志的下载文件。`);
    } catch {
      onNotice("模拟日志导出失败，请重试。");
    }
  };

  return (
    <div className={sections.stack}>
      <div className={sections.toolbar}>
        <SegmentedControl label="日志级别" options={levels} value={level} onChange={setLevel} />
        <div className={sections.actions}>
          <Button size="xs" onClick={onRefresh}>
            刷新
          </Button>
          <Button size="xs" disabled={visible.length === 0} onClick={download}>
            导出
          </Button>
        </div>
      </div>
      <section className={styles.list} aria-label="模拟日志记录">
        {visible.map((entry) => (
          <div className={styles.entry} key={entry.id}>
            <span className={styles.time}>{entry.time}</span>
            <span className={`${styles.level} ${styles[entry.level]}`}>{logLevelLabels[entry.level]}</span>
            <span>{entry.message}</span>
          </div>
        ))}
        {visible.length === 0 && <EmptyState title="没有符合条件的模拟日志" />}
      </section>
      <div className={sections.toolbar}>
        <span className={sections.muted}>共 {visible.length} 条 · 模拟日志</span>
        <div className={sections.actions}>
          <Button size="xs" onClick={() => onNotice("日志目录需由主进程打开，文件服务尚未接入。")}>
            打开文件夹
          </Button>
          <TextButton tone="danger" disabled={logs.length === 0} onClick={onClear}>
            清除日志
          </TextButton>
        </div>
      </div>
    </div>
  );
}
