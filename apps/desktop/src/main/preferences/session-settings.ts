import { defaultSessionSettings, isSessionSettings, type SessionSettings } from "@glaze/contracts";
import type { PreferenceStore } from "@glaze/storage";
import { CapabilityError } from "../ipc/errors";

/** Persist the account page's session preferences independently of the selected account */
export class SessionSettingsService {
  constructor(private readonly store: PreferenceStore) {}

  /** Read saved preferences or use defaults for an installation without session settings */
  get(): SessionSettings {
    const value = this.store.get("sessionSettings");
    return isSessionSettings(value) ? value : { ...defaultSessionSettings };
  }

  /** Validate and atomically save preferences before returning their confirmed values */
  set(value: unknown): SessionSettings {
    if (!isSessionSettings(value)) throw new CapabilityError("validation", "会话设置无效");
    const saved = { autoLogin: value.autoLogin, notifyOnExpire: value.notifyOnExpire };
    this.store.set("sessionSettings", saved);
    return saved;
  }
}
