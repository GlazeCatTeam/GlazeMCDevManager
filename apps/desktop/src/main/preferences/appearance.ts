import {
  type AppearanceSettings,
  defaultAppearance,
  defaultRankingBoards,
  isAppearanceSettings,
  isRankingLayout,
  type RankBoard,
} from "@glaze/contracts";
import type { PreferenceStore } from "@glaze/storage";
import { CapabilityError } from "../ipc/errors";

/** Validate appearance and supported layout preferences before accessing storage */
export class AppearanceService {
  constructor(private readonly store: PreferenceStore) {}

  /** Restore saved appearance or safe defaults for absent or damaged data */
  get(): AppearanceSettings {
    const value = this.store.get("appearance");
    return isAppearanceSettings(value) ? value : { ...defaultAppearance };
  }

  /** Save only supported theme, mode and zoom combinations */
  set(value: unknown): AppearanceSettings {
    if (!isAppearanceSettings(value)) throw new CapabilityError("validation", "外观设置无效");
    const saved = { themeId: value.themeId, colorMode: value.colorMode, scale: value.scale };
    this.store.set("appearance", saved);
    return saved;
  }

  /** Restore the home leaderboard's visible tabs */
  getRanking(): RankBoard[] {
    const value = this.store.getLayout("glaze.home/ranking");
    return isRankingLayout(value) ? value : [...defaultRankingBoards];
  }

  /** Persist the existing home page layout control */
  setRanking(value: unknown): RankBoard[] {
    if (!isRankingLayout(value)) throw new CapabilityError("validation", "至少保留一个有效榜单");
    this.store.setLayout("glaze.home/ranking", value);
    return [...value];
  }

  /** Restore all saved layouts without resetting theme, zoom or accounts */
  resetLayouts(): RankBoard[] {
    this.store.resetLayouts();
    return this.getRanking();
  }
}
