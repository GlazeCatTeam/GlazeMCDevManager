import type { RankBoard } from "./rank";

export interface AppearanceSettings {
  themeId: string;
  colorMode: "dark" | "light" | "system";
  scale: 90 | 100 | 110 | 125;
}

export const defaultAppearance: Readonly<AppearanceSettings> = { themeId: "ore-ui", colorMode: "dark", scale: 100 };
export const defaultRankingBoards: readonly RankBoard[] = ["pe_hot", "hot_search", "pe_download"];
const rankingBoards: readonly string[] = [...defaultRankingBoards, "pe_sell", "pc_download", "pc_like"];

/** Validate persisted preferences and untrusted RPC payloads */
export function isAppearanceSettings(value: unknown): value is AppearanceSettings {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.themeId === "string" &&
    /^[a-z][a-z0-9.-]{0,99}$/.test(item.themeId) &&
    (item.colorMode === "dark" || item.colorMode === "light" || item.colorMode === "system") &&
    (item.themeId !== "fluent-dark" || item.colorMode === "dark") &&
    (item.scale === 90 || item.scale === 100 || item.scale === 110 || item.scale === 125)
  );
}

/** Keep at least one known leaderboard visible, without duplicate entries */
export function isRankingLayout(value: unknown): value is RankBoard[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= rankingBoards.length &&
    new Set(value).size === value.length &&
    value.every((board) => typeof board === "string" && rankingBoards.includes(board))
  );
}
