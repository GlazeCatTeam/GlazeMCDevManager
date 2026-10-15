import type { LogEntry, LogLevel } from "./mock";

/** Select mock records at the requested log level */
export function filterLogs(logs: LogEntry[], level: LogLevel | "all"): LogEntry[] {
  return level === "all" ? logs : logs.filter((entry) => entry.level === level);
}

/** Download the visible sample records without accessing filesystem logs */
export function exportLogs(logs: LogEntry[]): void {
  const lines = [
    "Glaze MC Dev Manager - 模拟日志",
    ...logs.map((entry) => `[${entry.time}] [${entry.level.toUpperCase()}] ${entry.message}`),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "glaze-preview-logs.txt";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
