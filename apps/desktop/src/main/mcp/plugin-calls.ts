import { randomUUID } from "node:crypto";
import { mcpPermissions, type PluginToolCall } from "@glaze/contracts";
import { McpError, type PluginToolTarget, publicValue } from "@glaze/mcp";

export interface PluginToolWindow {
  id: number;
  send(call: PluginToolCall): void;
}

interface PendingCall {
  sender: number;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

/** Bind renderer replies to a pending call and the exact main window that received it */
export class PluginToolCalls {
  private readonly pending = new Map<string, PendingCall>();

  /** Inject the trusted window, current grant lookup and testable response deadline */
  constructor(
    private readonly window: () => PluginToolWindow | null,
    private readonly allowed: (clientId: string, permission: string) => boolean,
    private readonly timeoutMs = 30_000,
  ) {}

  /** Send only the manifest and client permission intersection after final write checks */
  async invoke(
    clientId: string,
    tool: PluginToolTarget,
    input: Record<string, unknown>,
    guard: () => void,
    beforeWrite: () => void,
  ): Promise<unknown> {
    guard();
    const window = this.window();
    if (!window) throw new McpError("unavailable", "插件工具没有可用窗口，请先打开 Glaze 窗口");
    const { account, idempotencyKey: _key, ...params } = input;
    const call: PluginToolCall = {
      callId: randomUUID(),
      pluginId: tool.pluginId,
      toolId: tool.toolId,
      params,
      account: typeof account === "string" ? account : null,
      permissions: mcpPermissions.filter(
        (permission) => tool.permissions.includes(permission) && this.allowed(clientId, permission),
      ),
    };
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(call.callId);
        reject(new McpError("timeout", "插件工具没有响应，请确认 Glaze 窗口已打开"));
      }, this.timeoutMs);
      this.pending.set(call.callId, { sender: window.id, resolve, reject, timer });
      try {
        beforeWrite();
        window.send(call);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(call.callId);
        reject(error);
      }
    });
    guard();
    return result;
  }

  /** Reject malformed, foreign, duplicate or late replies without consuming another call */
  result(sender: number, input: unknown): void {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new McpError("validation", "插件工具结果格式无效");
    const result = input as Record<string, unknown>;
    if (
      typeof result.callId !== "string" ||
      typeof result.ok !== "boolean" ||
      (result.ok ? !Object.hasOwn(result, "value") : typeof result.error !== "string") ||
      Object.keys(result).some((key) => !["callId", "ok", result.ok ? "value" : "error"].includes(key))
    )
      throw new McpError("validation", "插件工具结果格式无效");
    const pending = this.pending.get(result.callId);
    if (!pending || pending.sender !== sender)
      throw new McpError("forbidden", "插件工具调用不存在、已完成或窗口不匹配");
    clearTimeout(pending.timer);
    this.pending.delete(result.callId);
    if (result.ok) {
      try {
        pending.resolve(publicValue(result.value));
      } catch {
        pending.reject(new McpError("parse", "插件工具结果无法解析"));
      }
    } else pending.reject(new McpError("plugin", result.error as string));
  }

  /** Release all pending calls on service shutdown without claiming sent writes were cancelled */
  close(): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(new McpError("timeout", "MCP 服务已停止，插件工具执行结果无法确认"));
    }
    this.pending.clear();
  }
}
