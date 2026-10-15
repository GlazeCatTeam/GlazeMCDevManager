/** Application-wide preferences; autoLogin is applied only when the process starts */
export interface SessionSettings {
  autoLogin: boolean;
  notifyOnExpire: boolean;
}

export const defaultSessionSettings: Readonly<SessionSettings> = { autoLogin: true, notifyOnExpire: true };

/** Accept exactly the two boolean preferences, never credentials or arbitrary settings */
export function isSessionSettings(value: unknown): value is SessionSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return (
    Object.keys(settings).length === 2 &&
    typeof settings.autoLogin === "boolean" &&
    typeof settings.notifyOnExpire === "boolean"
  );
}
