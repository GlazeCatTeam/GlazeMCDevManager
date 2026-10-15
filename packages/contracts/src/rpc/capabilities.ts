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
  "analytics.daily": shellOnly("netease:analytics.read", "read"),
  "analytics.periodIncome": shellOnly("netease:analytics.read", "read"),
  "analytics.monthly": shellOnly("netease:analytics.read", "read"),
  "analytics.realtime": shellOnly("netease:income.read", "read"),
  "general.get": shellOnly(null, "read"),
  "general.set": shellOnly(null, "write"),
  "general.clearCache": shellOnly(null, "write"),
  "app.rememberRoute": shellOnly(null, "write"),
  "appearance.get": shellOnly(null, "read"),
  "appearance.set": shellOnly(null, "write"),
  "layout.getRanking": shellOnly(null, "read"),
  "layout.setRanking": shellOnly(null, "write"),
  "layout.reset": shellOnly(null, "write"),
  "feedback.list": shellOnly("netease:community.read", "read"),
  "feedback.reply": shellOnly("netease:community.write", "write"),
  "feedback.log": shellOnly("netease:community.read", "read"),
  "comments.list": shellOnly("netease:community.read", "read"),
  "comments.reply": shellOnly("netease:community.write", "write"),
  "messages.list": shellOnly("netease:messages.read", "read"),
  "messages.unreadCount": shellOnly("netease:messages.read", "read"),
  "messages.get": shellOnly("netease:messages.write", "write"),
  "messages.markAllRead": shellOnly("netease:messages.write", "write"),
  "messages.delete": shellOnly("netease:messages.write", "write"),
  "works.cancelReview": shellOnly("netease:works.write", "write"),
  "works.publish": shellOnly("netease:works.write", "write"),
  "works.appointOnline": shellOnly("netease:works.write", "write"),
  "works.cancelAppointOnline": shellOnly("netease:works.write", "write"),
  "works.submitSelfTest": shellOnly("netease:works.write", "write"),
  "works.cancelTest": shellOnly("netease:works.write", "write"),
  "works.delete": shellOnly("netease:works.write", "dangerous"),
  "works.changePrice": shellOnly("netease:works.write", "write"),
  "works.create": shellOnly("netease:works.write", "write"),
  "works.page": shellOnly("netease:works.read", "read"),
  "works.editor": shellOnly("netease:works.read", "read"),
  "works.options": shellOnly("netease:works.read", "read"),
  "works.save": shellOnly("netease:works.write", "write"),
  "works.submitReview": shellOnly("netease:works.write", "write"),
  "works.upload": shellOnly("netease:works.write", "write"),
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
  "developer.level": {
    caller: "any",
    permission: "netease:account.read",
    risk: "read",
    mcp: {
      title: "开发者等级",
      description:
        "返回开发者等级、阶、当前等级的经验区间与总经验、升阶任务是否完成，以及本月贡献分数和排名。参数 account 可选，默认当前账号。",
    },
  },
  "analytics.overview": {
    caller: "any",
    permission: "netease:analytics.read",
    risk: "read",
    mcp: {
      title: "数据概览",
      description:
        "返回整个账号的钻石收益和下载量概览：本月与上月、昨日与近 14 日日均。数值来自网易平台，不含作品明细。参数 account 可选，默认当前账号。",
    },
  },
  "income.estimate": {
    caller: "any",
    permission: "netease:income.read",
    risk: "read",
    mcp: {
      title: "收益速算",
      description:
        "按网易的分成与激励规则估算某个结算月的收益（元）：流水、开发者分成、激励补贴、税额和税后收益。month 为 YYYY-MM，默认本月；参数 account 可选。结果是估算，以平台结算记录为准；failedWorks 非空时表示这些作品查询失败、总额不完整。会逐个查询作品，比较慢，不要频繁调用。",
    },
  },
  "rank.list": {
    caller: "any",
    permission: "netease:rank.read",
    risk: "read",
    mcp: {
      title: "平台排行榜",
      description:
        "返回网易我的世界资源平台的榜单。board：pe_hot 手游热门飙升、hot_search 热搜（返回搜索词，不是作品）、pe_download 手游免费、pe_sell 手游畅销、pc_download 端游下载、pc_like 端游点赞。category：mod 模组、map 地图、texture 材质光影、lobby 联机大厅，默认 mod，热搜忽略此参数。limit 1–50，默认 10。",
    },
  },
  "works.list": {
    caller: "any",
    permission: "netease:works.read",
    risk: "read",
    mcp: {
      title: "列出作品",
      description:
        "列出账号在手机版（PE）的全部作品：作品 ID、名称、状态（online 已上架、init 待提交审核、reviewing 审核中、reject 未通过、accept 待上架、self_test 自测中、offline 已下架等）、价格与货币、是否原创、是否同步端游、是否前置模组、是否弱下架及原因、创建与提审时间。不含封面和上线时间，需要时用 works_get。参数 account 可选。",
    },
  },
  "works.get": {
    caller: "any",
    permission: "netease:works.read",
    risk: "read",
    mcp: {
      title: "作品详情",
      description:
        "按作品 ID 返回作品的正方形图标地址、横幅图地址、上线时间、首次上线时间和定时上架时间。只能查询本账号的作品。参数 account 可选。",
    },
  },
  "works.reviewFeedback": {
    caller: "any",
    permission: "netease:works.read",
    risk: "read",
    mcp: {
      title: "审核反馈",
      description:
        "返回作品最近一次审核的反馈文字和时间；没有反馈时返回 null。只能查询本账号的作品。参数 account 可选。",
    },
  },
};
