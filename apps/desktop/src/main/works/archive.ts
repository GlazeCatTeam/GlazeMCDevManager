import { McpError } from "@glaze/mcp";
import type { PreferenceStore } from "@glaze/storage";

/** Account-local visibility shared by the UI and AI tools, separate from platform status */
export class WorkArchiveService {
  constructor(
    private readonly store: Pick<PreferenceStore, "get" | "set">,
    private readonly accountExists: (account: string) => boolean,
    private readonly changed: (account: string, itemIds: string[]) => void,
  ) {}

  private key(account: string): string {
    if (!this.accountExists(account)) throw new McpError("not_found", "账号不存在");
    return `works.archive.v1:${account}`;
  }

  private ids(value: unknown): string[] {
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !/^\d{1,32}$/.test(id)))
      throw new McpError("storage", "归档记录格式无效，原记录已保留");
    return [...new Set<string>(value)];
  }

  /** Refuse unsynchronized records instead of exposing works archived in an older UI */
  get(account: string): string[] {
    const stored = this.store.get(this.key(account));
    if (stored === undefined)
      throw new McpError("archive_not_ready", "归档记录尚未同步，请打开 Glaze 窗口完成同步后重试");
    return this.ids(stored);
  }

  /** Import once; an older window must never resurrect records already restored by a tool */
  migrate(account: string, legacy: unknown): string[] {
    const key = this.key(account);
    if (this.store.get(key) !== undefined) return this.get(account);
    const ids = this.ids(legacy);
    this.persist(key, ids);
    this.changed(account, ids);
    return ids;
  }

  set(account: string, itemId: string, archived: boolean): string[] {
    if (!/^\d{1,32}$/.test(itemId)) throw new McpError("validation", "作品 ID 无效");
    const ids = new Set(this.get(account));
    if (archived) ids.add(itemId);
    else ids.delete(itemId);
    const next = [...ids];
    this.persist(this.key(account), next);
    this.changed(account, next);
    return next;
  }

  private persist(key: string, ids: string[]): void {
    try {
      this.store.set(key, ids);
    } catch {
      throw new McpError("storage", "归档记录保存失败，作品未作更改");
    }
  }

  /** An explicit override applies only to this call, including its later write phases */
  assertAccess(account: string, itemIds: string[], includeArchived: boolean): void {
    const archived = new Set(this.get(account));
    if (!includeArchived && itemIds.some((id) => archived.has(id)))
      throw new McpError("archived", "作品已归档，默认不读取或操作；仅在用户明确要求时传 includeArchived: true");
  }
}
