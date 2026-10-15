import {
  type AppearanceSettings,
  type AvailableTheme,
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
  constructor(
    private readonly store: PreferenceStore,
    private readonly themes?: () => AvailableTheme[],
  ) {}

  /** Only enabled installed themes can become the saved appearance */
  private supported(value: AppearanceSettings): boolean {
    if (!this.themes) return value.themeId === "ore-ui" || value.themeId === "fluent-dark";
    const theme = this.themes().find((item) => item.id === value.themeId);
    return !!theme && (value.colorMode === "system" ? theme.modes.length === 2 : theme.modes.includes(value.colorMode));
  }

  /** Restore saved appearance or safe defaults for absent or damaged data */
  get(): AppearanceSettings {
    const value = this.store.get("appearance");
    return isAppearanceSettings(value) && this.supported(value) ? value : { ...defaultAppearance };
  }

  /** Save only supported theme, mode and zoom combinations */
  set(value: unknown): AppearanceSettings {
    if (!isAppearanceSettings(value) || !this.supported(value))
      throw new CapabilityError("validation", "外观设置无效或主题未启用");
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
