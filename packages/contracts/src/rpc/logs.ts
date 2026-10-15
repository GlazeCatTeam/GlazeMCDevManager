export type LogLevel = "info" | "warn" | "error";
export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  source: string;
  message: string;
}
export interface LogQuery {
  level: LogLevel | "all";
}
export interface LogPage {
  entries: LogEntry[];
  truncated: boolean;
}

/** Reject malformed filters before reading or exporting log files */
export function isLogQuery(value: unknown): value is LogQuery {
  if (!value || typeof value !== "object") return false;
  const level = (value as Record<string, unknown>).level;
  return level === "all" || level === "info" || level === "warn" || level === "error";
}
