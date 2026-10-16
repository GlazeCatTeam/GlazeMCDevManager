import {
  callHost,
  capabilities,
  onHostEvent,
  type PluginToolCall,
  type PluginToolContext,
  type RpcMethod,
  usePluginRegistry,
} from "@glaze/plugin-sdk";
import { useEffect, useMemo } from "react";
import { loadPluginModule, manifests } from "./catalog";

/** Host calls a tool handler may make: only capabilities whose permission the current MCP call allows */
function scopedCall(call: PluginToolCall): PluginToolContext["callHost"] {
  return ((method: RpcMethod, params?: unknown) => {
    const capability = capabilities[method];
    if (capability?.caller !== "any" || capability.permission === "netease:account.manage")
      return Promise.resolve({ ok: false, error: { kind: "forbidden", message: `插件工具不能调用 ${method}` } });
    if (capability.permission && !call.permissions.includes(capability.permission))
      return Promise.resolve({
        ok: false,
        error: { kind: "forbidden", message: `插件工具缺少权限 ${capability.permission}` },
      });
    return callHost(method, params as never);
  }) as PluginToolContext["callHost"];
}

/** Run one tool call from the main process and always answer it, even when the handler fails */
async function runTool(call: PluginToolCall): Promise<void> {
  try {
    const module = await loadPluginModule(call.pluginId);
    const handler = module.tools?.[call.toolId];
    if (!handler) throw new Error("插件没有实现这个工具");
    const value = await handler(call.params, {
      account: call.account,
      permissions: call.permissions,
      callHost: scopedCall(call),
    });
    await callHost("plugins.toolResult", { callId: call.callId, ok: true, value: value ?? null });
  } catch (error) {
    await callHost("plugins.toolResult", {
      callId: call.callId,
      ok: false,
      error: error instanceof Error ? error.message : "插件工具执行失败",
    }).catch(() => undefined);
  }
}

/**
 * Plugin lifecycle owned by the shell: runs MCP tool calls in the owning plugin's module and starts
 * plugins that declare the "onStartup" activation event while they are enabled
 */
export function PluginRuntime() {
  const registry = usePluginRegistry();
  const states = registry?.snapshot?.plugins;
  const startup = useMemo(
    () =>
      manifests
        .filter((manifest) => manifest.activationEvents?.includes("onStartup"))
        .filter((manifest) => !states || states.some((plugin) => plugin.id === manifest.id && plugin.enabled))
        .map((manifest) => manifest.id)
        .join(","),
    [states],
  );

  useEffect(() => onHostEvent("plugins.toolCall", (call) => void runTool(call)), []);

  useEffect(() => {
    if (!startup) return;
    let active = true;
    const disposers: (() => void)[] = [];
    for (const id of startup.split(",")) {
      void loadPluginModule(id)
        .then((module) => {
          const dispose = active ? module.activate?.() : undefined;
          if (dispose) disposers.push(dispose);
        })
        .catch(() => {
          void callHost("app.reportRendererError", { kind: "error" }).catch(() => {});
        });
    }
    return () => {
      active = false;
      for (const dispose of disposers) dispose();
    };
  }, [startup]);

  return null;
}
