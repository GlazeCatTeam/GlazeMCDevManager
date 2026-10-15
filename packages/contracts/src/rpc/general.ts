export interface GeneralSettings {
  launchAtLogin: boolean;
  startPage: "home" | "works" | "last";
  closeAction: "tray" | "quit";
}

export interface GeneralState {
  settings: GeneralSettings;
  launchAtLoginSupported: boolean;
  launchAtLoginWarning: string | null;
}

export interface CacheClearResult {
  clearedBytes: number;
  warnings: string[];
}

export const defaultGeneral: Readonly<GeneralSettings> = {
  launchAtLogin: false,
  startPage: "home",
  closeAction: "tray",
};

// Only page roots are restored; editor IDs, login parameters and unsaved forms are never persisted
export const restorableRoutes = [
  "glaze.home/home",
  "glaze.works/works",
  "glaze.analytics/analytics",
  "glaze.community/feedback",
  "glaze.community/comments",
  "glaze.messages/messages",
  "glaze.settings/settings",
  "glaze.account/account",
] as const;

/** Validate settings before native side effects or database writes */
export function isGeneralSettings(value: unknown): value is GeneralSettings {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.launchAtLogin === "boolean" &&
    (item.startPage === "home" || item.startPage === "works" || item.startPage === "last") &&
    (item.closeAction === "tray" || item.closeAction === "quit")
  );
}

/** Accept only installed, safe page roots when remembering the previous page */
export function isRestorableRoute(value: unknown): value is string {
  return typeof value === "string" && (restorableRoutes as readonly string[]).includes(value);
}
