import type { EventPayloads, RpcMethods } from "@glaze/contracts";
import { McpError } from "@glaze/mcp";
import { type LogService, redactLog } from "../logs/service";
import type { BuiltinPlugin, PluginRegistry } from "../plugins/registry";
import type { ApplicationActions } from "../preferences/actions";

export interface NavigationWindow {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  navigate(payload: EventPayloads["app.navigate"]): void;
}

/** Adapt application services without exposing arbitrary RPC calls or native file pickers */
export function createMcpApplication(
  actions: ApplicationActions,
  plugins: Pick<PluginRegistry, "snapshot">,
  logs: Pick<LogService, "list">,
  manifests: readonly BuiltinPlugin[],
  window: () => NavigationWindow,
) {
  const pages = manifests.flatMap((plugin) =>
    (plugin.contributes?.pages ?? [])
      .filter((page) => page.chrome !== "none")
      .map((page) => ({ route: `${plugin.id}/${page.id}`, title: page.title, pluginId: plugin.id })),
  );
  return async (
    method: string,
    params: Record<string, unknown>,
    guard: () => void,
    beforeWrite: () => void,
  ): Promise<unknown> => {
    guard();
    switch (method) {
      case "app.settings_get":
        return actions.settings();
      case "app.plugins_list":
        return plugins.snapshot().plugins.map(({ id, name, version, required, enabled, error }) => ({
          id,
          name,
          version,
          required,
          enabled,
          error: error ? redactLog(error) : error,
          pages: pages.filter((page) => page.pluginId === id).map(({ route, title }) => ({ route, title })),
        }));
      case "app.logs_list": {
        const page = logs.list({ level: params.level as RpcMethods["logs.list"]["params"]["level"] });
        const limit = Math.min(200, params.limit as number);
        return {
          entries: page.entries
            .slice(0, limit)
            .map((entry) => ({ ...entry, source: redactLog(entry.source), message: redactLog(entry.message) })),
          truncated: page.truncated || page.entries.length > limit,
        };
      }
      case "app.appearance_set":
        beforeWrite();
        return actions.appearance(params.settings as RpcMethods["appearance.set"]["params"]);
      case "app.general_set":
        beforeWrite();
        return actions.general(params.settings as RpcMethods["general.set"]["params"]);
      case "app.layout_ranking_set":
        beforeWrite();
        return actions.ranking(params.boards as RpcMethods["layout.setRanking"]["params"]);
      case "app.layout_reset":
        beforeWrite();
        return actions.reset();
      case "app.session_settings_set":
        beforeWrite();
        return actions.session(params.settings as RpcMethods["sessionSettings.set"]["params"]);
      case "app.cache_clear":
        beforeWrite();
        return actions.clearCache();
      case "app.plugins_set_enabled":
        beforeWrite();
        return actions.setEnabled({ id: params.id as string, enabled: params.enabled as boolean });
      case "app.switch_account":
        return actions.switchAccount(params.account as string, beforeWrite);
      case "app.open_page": {
        const page = pages.find((page) => page.route === params.route);
        if (!page) throw new McpError("validation", "页面不存在或不允许打开登录页");
        if (!plugins.snapshot().plugins.some((plugin) => plugin.id === page.pluginId && plugin.enabled))
          throw new McpError("forbidden", "页面所属插件已停用");
        // No current bundled page consumes a safe detail identifier through navigation params
        if (Object.keys((params.params ?? {}) as object).length)
          throw new McpError("validation", "此页面不支持导航参数");
        const win = window();
        beforeWrite();
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        win.navigate({ route: page.route, params: {} });
        return { route: page.route, title: page.title };
      }
      default:
        throw new McpError("unknown_tool", "应用方法未注册");
    }
  };
}
