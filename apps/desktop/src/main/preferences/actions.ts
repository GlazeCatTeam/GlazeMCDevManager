import type { EventName, EventPayloads, RpcMethods } from "@glaze/contracts";
import type { PluginRegistry } from "../plugins/registry";
import type { SessionManager } from "../session/session-manager";
import type { AppearanceService } from "./appearance";
import type { CacheService } from "./cache";
import type { GeneralService } from "./general";
import type { SessionSettingsService } from "./session-settings";

export interface ApplicationServices {
  appearance: Pick<AppearanceService, "get" | "set" | "getRanking" | "setRanking" | "resetLayouts">;
  general: Pick<GeneralService, "get" | "set">;
  cache: Pick<CacheService, "clear">;
  sessionSettings: Pick<SessionSettingsService, "get" | "set">;
  plugins: Pick<PluginRegistry, "snapshot" | "setEnabled">;
  sessions: Pick<SessionManager, "switchTo">;
}
export type Broadcast = <E extends EventName>(event: E, payload: EventPayloads[E]) => void;

/** Share validated application mutations and their broadcasts between IPC and MCP */
export function createApplicationActions(services: ApplicationServices, broadcast: Broadcast) {
  const { appearance, general, cache, sessionSettings, plugins, sessions } = services;
  return {
    /** Read all non-credential application preferences */
    settings() {
      return {
        appearance: appearance.get(),
        general: general.get(),
        ranking: appearance.getRanking(),
        session: sessionSettings.get(),
      };
    },
    /** Persist appearance before notifying every application window */
    appearance(params: RpcMethods["appearance.set"]["params"]) {
      const saved = appearance.set(params);
      broadcast("appearance.changed", saved);
      return saved;
    },
    /** Apply native startup preferences and broadcast the confirmed state */
    general(params: RpcMethods["general.set"]["params"]) {
      const saved = general.set(params);
      broadcast("general.changed", saved);
      return saved;
    },
    /** Persist session preferences without exposing credentials */
    session(params: RpcMethods["sessionSettings.set"]["params"]) {
      const saved = sessionSettings.set(params);
      broadcast("sessionSettings.changed", saved);
      return saved;
    },
    /** Save the visible ranking tabs and notify the home page */
    ranking(params: RpcMethods["layout.setRanking"]["params"]) {
      const saved = appearance.setRanking(params);
      broadcast("layout.rankingChanged", saved);
      return saved;
    },
    /** Restore saved layouts and notify the home page */
    reset() {
      const saved = appearance.resetLayouts();
      broadcast("layout.rankingChanged", saved);
      return saved;
    },
    /** Delegate cleanup and its notification to the existing cache service */
    clearCache: () => cache.clear(),
    /** Delegate registry validation and plugin broadcasts to the registry */
    setEnabled: (params: RpcMethods["plugins.setEnabled"]["params"]) => plugins.setEnabled(params?.id, params?.enabled),
    /** Reuse verified switching and account broadcasts with a final authorization guard */
    switchAccount: (id: string, beforeSwitch?: () => void) => sessions.switchTo(id, beforeSwitch),
  };
}
export type ApplicationActions = ReturnType<typeof createApplicationActions>;
