import type { RpcMethod } from "./bridge";

// Capability metadata for every RPC method: who may call it, which permission it needs,
// how risky it is and whether AI tools may use it over MCP. See docs/architecture/13-mcp.md

export type Risk = "read" | "write" | "dangerous";

export interface McpExposure {
  title: string;
  /** Written for the AI: what it does, defaults, what it returns, when not to use it */
  description: string;
}

export interface Capability {
  /** "shell": only the app's own UI may call it; "any": plugins and MCP clients too, subject to permission */
  caller: "shell" | "any";
  permission: string | null;
  risk: Risk;
  /** Present only for capabilities exposed as MCP tools */
  mcp?: McpExposure;
}

const shellOnly = (permission: string | null, risk: Risk): Capability => ({ caller: "shell", permission, risk });

export const capabilities: Record<RpcMethod, Capability> = {
  "window.minimize": shellOnly(null, "read"),
  "window.toggleMaximize": shellOnly(null, "read"),
  "window.close": shellOnly(null, "read"),
  "window.getState": shellOnly(null, "read"),
  "app.getInitialRoute": shellOnly(null, "read"),
  "account.list": {
    caller: "any",
    permission: "netease:account.read",
    risk: "read",
    mcp: {
      title: "列出账号",
      description:
        "列出本机保存的网易开发者账号：本地 ID、昵称、通行证账号、登录方式和会话状态（active / expired / offline）。不含任何凭据。",
    },
  },
  "account.current": {
    caller: "any",
    permission: "netease:account.read",
    risk: "read",
    mcp: {
      title: "当前账号",
      description: "返回界面当前使用的账号摘要；没有登录任何账号时返回 null。不含任何凭据。",
    },
  },
  // Login, cookie import, switching and removal manage credentials and are never exposed to MCP
  "account.loginWithWindow": shellOnly("netease:account.manage", "write"),
  "account.cancelLogin": shellOnly("netease:account.manage", "read"),
  "account.loginWithCookie": shellOnly("netease:account.manage", "write"),
  "account.verify": shellOnly("netease:account.manage", "read"),
  "account.switch": shellOnly("netease:account.manage", "write"),
  "account.logout": shellOnly("netease:account.manage", "write"),
  "account.remove": shellOnly("netease:account.manage", "dangerous"),
};
