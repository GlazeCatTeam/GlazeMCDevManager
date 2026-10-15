import type { CacheClearResult } from "@glaze/contracts";

export interface ResourceCache {
  getCacheSize: () => Promise<number>;
  clearCache: () => Promise<void>;
  clearCodeCaches: (options: Record<string, never>) => Promise<void>;
}

/** Clear only Electron resource caches and proxy images, never cookies or application storage */
export class CacheService {
  private pending: Promise<CacheClearResult> | null = null;

  constructor(
    private readonly resources: ResourceCache,
    private readonly clearImages: () => void,
    private readonly notify: () => void,
  ) {}

  /** Share concurrent cleanup calls so resources are not cleared repeatedly */
  clear(): Promise<CacheClearResult> {
    if (!this.pending)
      this.pending = this.run().finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  /** Finish independent cleanup steps and report any partial failures accurately */
  private async run(): Promise<CacheClearResult> {
    const warnings: string[] = [];
    const before = await this.resources.getCacheSize().catch(() => 0);
    let cleared = false;
    try {
      await this.resources.clearCache();
      cleared = true;
    } catch {
      warnings.push("页面资源缓存清理失败，请重试");
    }
    try {
      await this.resources.clearCodeCaches({});
    } catch {
      warnings.push("脚本缓存清理失败，请重试");
    }
    this.clearImages();
    this.notify();
    const after = await this.resources.getCacheSize().catch(() => before);
    return { clearedBytes: cleared ? Math.max(0, before - after) : 0, warnings };
  }
}
