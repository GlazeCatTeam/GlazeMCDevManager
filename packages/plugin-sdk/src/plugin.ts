import type { RpcMethod, RpcMethods, RpcResult } from "@glaze/contracts";
import type { ComponentType } from "react";

/** Host calls available to a plugin tool handler, limited to the permissions of the current MCP call */
export interface PluginToolContext {
  /** Account the AI client resolved for this call; null for account-independent tools */
  account: string | null;
  /** Permissions this call may use: the plugin's own permissions intersected with the client's grant */
  permissions: readonly string[];
  /** Call a host capability; capabilities outside `permissions` are rejected before reaching the host */
  callHost<M extends RpcMethod>(
    method: M,
    params?: RpcMethods[M]["params"],
  ): Promise<RpcResult<RpcMethods[M]["result"]>>;
}

export type PluginToolHandler = (params: Record<string, unknown>, ctx: PluginToolContext) => Promise<unknown>;

/** Warm data for a page before the user opens it; receives a session-bound prefetch */
export type PluginPrefetch = (
  prefetch: <M extends RpcMethod>(method: M, params?: RpcMethods[M]["params"]) => void,
) => void;

/**
 * Runtime half of a plugin. The manifest declares what exists (pages, navigation, settings sections,
 * home widgets, tools); the module supplies the code for each declared id
 */
export interface PluginModule {
  /** Page components keyed by manifest page id */
  pages?: Record<string, ComponentType>;
  /** Settings sections keyed by manifest settingsSections id, rendered inside the settings page */
  settingsSections?: Record<string, ComponentType>;
  /** Home widgets keyed by manifest homeWidgets id, rendered in the home page's extension row */
  homeWidgets?: Record<string, ComponentType>;
  /** MCP tool handlers keyed by manifest tools id */
  tools?: Record<string, PluginToolHandler>;
  /** Data warmers keyed by page id, called when its navigation item is hovered or focused */
  prefetch?: Record<string, PluginPrefetch>;
  /** Started for plugins whose manifest has the "onStartup" activation event; returns a cleanup */
  activate?: () => (() => void) | undefined;
}

/** Identity helper that types a plugin's default export */
export function definePlugin(module: PluginModule): PluginModule {
  return module;
}
