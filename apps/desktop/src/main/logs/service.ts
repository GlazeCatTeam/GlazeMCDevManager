import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import type { LogEntry, LogLevel, LogPage, LogQuery } from "@glaze/contracts";
import { ensureOwnedDirectory, ownedPath } from "../files/owned-directory";

const filename = /^\d{4}-\d{2}-\d{2}(?:\.[12])?\.jsonl$/;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 500;

/** Remove credential-like values and control characters before logs reach disk or the UI */
export function redactLog(value: string): string {
  return (
    value
      .replace(/\b(?:cookie|set-cookie|authorization)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\r\n]*)/gi, "[凭据已隐藏]")
      .replace(
        /\b(?:NTES_SESS|P_INFO|password|passwd|token|secret|sessionCookie)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s;,]+)/gi,
        "[凭据已隐藏]",
      )
      .replace(/https?:\/\/[^\s]+/gi, "[链接已隐藏]")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: remove log control characters and newline injection
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .slice(0, 1500)
  );
}

/** Bounded daily JSONL logs with rotation, retention and an explicit read/write failure state */
export class LogService {
  private writeError: string | null = null;
  private lastRetentionDay = "";
  constructor(
    readonly directory: string,
    private readonly changed: () => void = () => {},
    private readonly now = () => new Date(),
  ) {
    this.write("info", "app", "应用日志服务已启动");
  }

  /** List only owned regular log files, newest day and active rotation first */
  private files(): string[] {
    ensureOwnedDirectory(this.directory);
    return readdirSync(this.directory)
      .filter((name) => filename.test(name))
      .sort((a, b) => {
        const day = b.slice(0, 10).localeCompare(a.slice(0, 10));
        const rotation = (name: string) => Number(name.match(/\.(\d)\.jsonl$/)?.[1] ?? 0);
        return day || rotation(a) - rotation(b);
      });
  }

  /** Record a bounded, redacted event; logging failure never crashes the business operation */
  write(level: LogLevel, source: string, message: string): void {
    try {
      ensureOwnedDirectory(this.directory);
      const now = this.now();
      const day = now.toISOString().slice(0, 10);
      const file = ownedPath(this.directory, `${day}.jsonl`);
      const entry: LogEntry = {
        id: randomUUID(),
        time: now.toISOString(),
        level,
        source: redactLog(source).slice(0, 80),
        message: redactLog(message),
      };
      const line = `${JSON.stringify(entry)}\n`;
      if (existsSync(file) && statSync(file).size + Buffer.byteLength(line) > MAX_BYTES) {
        const oldest = ownedPath(this.directory, `${day}.2.jsonl`);
        const previous = ownedPath(this.directory, `${day}.1.jsonl`);
        if (existsSync(oldest)) unlinkSync(oldest);
        if (existsSync(previous)) renameSync(previous, oldest);
        renameSync(file, previous);
      }
      appendFileSync(file, line, "utf8");
      if (this.lastRetentionDay !== day) {
        const cutoff = new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10);
        for (const name of this.files()) if (name.slice(0, 10) < cutoff) unlinkSync(ownedPath(this.directory, name));
        this.lastRetentionDay = day;
      }
      this.writeError = null;
      this.changed();
    } catch {
      this.writeError = "运行日志写入失败，请检查日志目录权限或磁盘空间";
    }
  }

  /** Read the newest matching records; damaged lines are reported instead of presented as empty logs */
  list(query: LogQuery): LogPage {
    if (this.writeError) throw new Error(this.writeError);
    const entries: LogEntry[] = [];
    for (const name of this.files()) {
      const file = ownedPath(this.directory, name);
      if (!statSync(file).isFile() || statSync(file).size > MAX_BYTES) throw new Error("日志文件异常，无法读取");
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).reverse();
      for (const line of lines) {
        let value: LogEntry;
        try {
          value = JSON.parse(line);
        } catch {
          throw new Error("日志文件包含损坏记录");
        }
        if (
          !value ||
          typeof value.time !== "string" ||
          typeof value.message !== "string" ||
          typeof value.source !== "string" ||
          typeof value.id !== "string" ||
          !["info", "warn", "error"].includes(value.level)
        )
          throw new Error("日志记录格式无效");
        if (query.level !== "all" && value.level !== query.level) continue;
        if (entries.length === MAX_ENTRIES) return { entries, truncated: true };
        entries.push({ ...value, source: redactLog(value.source), message: redactLog(value.message) });
      }
    }
    return { entries, truncated: false };
  }

  /** Delete only this service's named log files, without touching other files in the directory */
  clear(): void {
    for (const name of this.files()) unlinkSync(ownedPath(this.directory, name));
    this.writeError = null;
    this.changed();
  }

  /** Export the same bounded, redacted record set as the viewer */
  export(query: LogQuery): { text: string; count: number } {
    const page = this.list(query);
    return {
      text: [
        "Glaze MC Dev Manager - 运行日志",
        ...page.entries.map(
          (entry) => `[${entry.time}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`,
        ),
      ].join("\n"),
      count: page.entries.length,
    };
  }
}
