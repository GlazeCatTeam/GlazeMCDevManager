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
  "mcp.snapshot": shellOnly(null, "read"),
  "mcp.clearAudit": shellOnly(null, "write"),
  "mcp.resolveOperation": shellOnly(null, "write"),
  "mcp.setEnabled": shellOnly(null, "write"),
  "mcp.grant": shellOnly(null, "write"),
  "mcp.disconnect": shellOnly(null, "write"),
  "mcp.revoke": shellOnly(null, "write"),
  "mcp.directory": shellOnly(null, "write"),
  "mcp.installers": shellOnly(null, "read"),
  "mcp.connect": shellOnly(null, "write"),
  "mcp.answer": shellOnly(null, "write"),
  "mcp.repair": shellOnly(null, "write"),
  "promotion.activities": {
    caller: "any",
    permission: "netease:promotion.read",
    risk: "read",
    mcp: {
      title: "作品活动",
      description: "分页读取 PE 作品活动、报名截止日期和赛道。page 从 0 开始，每页 10 条。account 可选，默认当前账号。",
    },
  },
  "promotion.discount": {
    caller: "any",
    permission: "netease:promotion.read",
    risk: "read",
    mcp: {
      title: "折扣特卖",
      description: "读取当前折扣活动及赛道折扣范围、分区规则；无活动时 activity 为 null。account 可选。",
    },
  },
  "promotion.module": {
    caller: "any",
    permission: "netease:promotion.read",
    risk: "read",
    mcp: {
      title: "活动作品",
      description: "读取指定 kind（review 或 discount）、activityId、moduleId 下的候选和已报名作品。account 可选。",
    },
  },
  "promotion.dates": {
    caller: "any",
    permission: "netease:promotion.read",
    risk: "read",
    mcp: {
      title: "轮播图可申请日期",
      description: "返回 PE 轮播图日期（Unix 秒）、资格和不可申请原因。account 可选。",
    },
  },
  "promotion.applications": {
    caller: "any",
    permission: "netease:promotion.read",
    risk: "read",
    mcp: {
      title: "轮播图申请记录",
      description: "分页读取 PE 轮播图申请及审核状态。page 从 0 开始，每页 10 条。account 可选。",
    },
  },
  "promotion.join": shellOnly("netease:promotion.write", "write"),
  "promotion.cancelDiscount": shellOnly("netease:promotion.write", "write"),
  "promotion.saveBanner": shellOnly("netease:promotion.write", "write"),
  "promotion.upload": shellOnly("netease:promotion.write", "write"),
  "promotion.prepareImage": shellOnly("netease:promotion.write", "read"),
  "promotion.uploadImage": shellOnly("netease:promotion.write", "write"),
  "promotion.discardImage": shellOnly("netease:promotion.write", "write"),
  "app.getAbout": {
    caller: "any",
    permission: null,
    risk: "read",
    mcp: {
      title: "应用信息",
      description:
        "读取应用版本、开发或打包状态、操作系统与架构、Electron / Chromium / Node.js 版本及项目许可证标识、完整原文和 NOTICE。不含账号或本地路径，不检查更新。",
    },
  },
  "app.getLicenses": {
    caller: "any",
    permission: null,
    risk: "read",
    mcp: {
      title: "依赖许可",
      description:
        "读取构建时收集的生产依赖、Electron 与内置第三方资源的版本、许可标识及声明原文。离线可用；Chromium 等运行时第三方声明在随应用分发的 LICENSES.chromium.html 中单独提供。",
    },
  },
  "update.state": {
    caller: "any",
    permission: null,
    risk: "read",
    mcp: {
      title: "应用更新状态",
      description:
        "读取应用更新状态：当前版本、上次检查发现的新版本与更新说明、下载进度、是否已下载待重启安装、自动检查开关。不发起网络请求；开发版和免安装版返回 unsupported。",
    },
  },
  // Checking and downloading never touch user data or install anything, so it is a read
  "update.check": {
    caller: "any",
    permission: null,
    risk: "read",
    mcp: {
      title: "检查应用更新",
      description:
        "立即从 GitHub Releases 检查新版本，有新版本时在后台下载，返回最新状态（下载通常还在进行，可稍后用应用更新状态查看）。不会安装或重启应用；安装须由用户在应用内点击「重启并安装」。",
    },
  },
  // Restarting closes the user's windows and unsaved forms, so only the user may trigger it
  "update.install": shellOnly(null, "write"),
  "update.setAutoCheck": shellOnly(null, "write"),
  "app.openProjectLink": shellOnly(null, "write"),
  "app.openRuntimeNotices": shellOnly(null, "write"),
  "sessionSettings.get": shellOnly("netease:account.read", "read"),
  "sessionSettings.set": shellOnly("netease:account.manage", "write"),
  "app.reportRendererError": shellOnly(null, "write"),
  "plugins.list": shellOnly(null, "read"),
  "plugins.setEnabled": shellOnly(null, "write"),
  "plugins.toolResult": shellOnly(null, "write"),
  "plugins.pickInstall": shellOnly(null, "read"),
  "plugins.install": shellOnly(null, "write"),
  "logs.list": shellOnly(null, "read"),
  "logs.export": shellOnly(null, "write"),
  "logs.clear": shellOnly(null, "write"),
  "logs.openFolder": shellOnly(null, "read"),
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
  "messages.list": shellOnly("netease:messages.read", "read"),
  "messages.unreadCount": shellOnly("netease:messages.read", "read"),
  "messages.get": shellOnly("netease:messages.write", "write"),
  "messages.markAllRead": shellOnly("netease:messages.write", "write"),
  "messages.delete": shellOnly("netease:messages.write", "write"),
  "comments.list": shellOnly("netease:community.read", "read"),
  "comments.reply": shellOnly("netease:community.write", "write"),
  "analytics.daily": {
    caller: "any",
    permission: "netease:analytics.read",
    risk: "read",
    mcp: {
      title: "作品数据分析",
      description:
        "按作品 ID 和日期范围查询 PE/PC 日度数据。最多 500 个作品，日期范围不超过 366 天；数据缺失保留 null，不把缺失视为零。",
    },
  },
  "analytics.periodIncome": shellOnly("netease:analytics.read", "read"),
  "analytics.monthly": shellOnly("netease:analytics.read", "read"),
  "analytics.realtime": shellOnly("netease:income.read", "read"),
  "works.create": shellOnly("netease:works.write", "write"),
  "works.searchReferences": shellOnly("netease:works.read", "read"),
  "works.prepareImage": shellOnly("netease:works.write", "read"),
  "works.uploadCroppedImage": shellOnly("netease:works.write", "write"),
  "works.discardImage": shellOnly("netease:works.write", "write"),
  "works.cancelReview": shellOnly("netease:works.write", "write"),
  "works.publish": shellOnly("netease:works.write", "write"),
  "works.appointOnline": shellOnly("netease:works.write", "write"),
  "works.cancelAppointOnline": shellOnly("netease:works.write", "write"),
  "works.submitSelfTest": shellOnly("netease:works.write", "write"),
  "works.cancelTest": shellOnly("netease:works.write", "write"),
  "works.delete": shellOnly("netease:works.write", "dangerous"),
  "works.changePrice": shellOnly("netease:works.write", "write"),
  "works.page": shellOnly("netease:works.read", "read"),
  "works.archiveMigrate": shellOnly("netease:works.write", "write"),
  "works.archive": shellOnly("netease:works.write", "write"),
  "works.restore": shellOnly("netease:works.write", "write"),
  "works.archiveState": {
    caller: "any",
    permission: "netease:works.read",
    risk: "read",
    mcp: {
      title: "查询作品归档状态",
      description:
        "返回本账号已归档作品 ID，不读取作品内容。归档仅影响本软件，恢复使用 works_restore；明确需要读取归档内容时，在作品读取和操作工具中逐次传 includeArchived: true。",
    },
  },
  "works.search": shellOnly("netease:works.read", "read"),
  "works.editor": shellOnly("netease:works.read", "read"),
  "works.options": shellOnly("netease:works.read", "read"),
  "works.save": shellOnly("netease:works.write", "write"),
  "works.submitReview": shellOnly("netease:works.write", "write"),
  "works.upload": shellOnly("netease:works.write", "write"),
  "works.uploadDroppedResource": shellOnly("netease:works.write", "write"),
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
  "income.list": {
    caller: "any",
    permission: "netease:income.read",
    risk: "read",
    mcp: {
      title: "月度收益记录",
      description:
        "查询网易平台的月度结算记录与汇总。platform 必填：pe 手机版、pc 电脑版；account 可选，默认当前账号。金额单位为元，缺失金额为 null；availableYuan 可能包含历史月份，不可跨记录累加。本能力只查询，不申请结算。",
    },
  },
  "income.detail": {
    caller: "any",
    permission: "netease:income.read",
    risk: "read",
    mcp: {
      title: "收益结算详情",
      description:
        "按 income.list 返回的记录 id 查询收益、扣费、激励和可结算月份。account 可选，默认当前账号。不返回银行和身份信息，不申请结算。",
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
        "返回网易我的世界资源平台的榜单。board：pe_hot 手游热门飙升、hot_search 热搜（返回搜索词，不是作品）、pe_download 手游免费、pe_sell 手游畅销。category：mod 模组、map 地图、texture 材质光影、lobby 联机大厅，默认 mod，热搜忽略此参数。limit 1–50，默认 10。",
    },
  },
  "rank.page": {
    caller: "any",
    permission: "netease:rank.read",
    risk: "read",
    mcp: {
      title: "分页读取平台排行榜",
      description:
        "按 rank.list 的 board/category 查询真实榜单。start 为从 0 开始的偏移，默认 0；limit 1–50，默认 50。返回 items、平台 total 和 nextStart；继续使用 nextStart 读取下一批，null 表示结束。includeIcons 默认 true，传 false 不等待缺失封面，可随后用 rank.icons 补全。account 可选，不切换当前账号。",
    },
  },
  "rank.icons": {
    caller: "any",
    permission: "netease:rank.read",
    risk: "read",
    mcp: {
      title: "批量读取榜单封面",
      description:
        "按 itemIds 中最多 50 个准确数字作品 ID 查询公开封面，返回 ID 到图片地址的映射。缺图或暂时失败的 ID 省略，不影响榜单内容；不携带开发者 Cookie。",
    },
  },
  "works.list": {
    caller: "any",
    permission: "netease:works.read",
    risk: "read",
    mcp: {
      title: "列出作品",
      description:
        "列出账号作品，默认排除本地已归档作品；仅用户明确要求时传 includeArchived: true。返回作品 ID、名称、状态、价格等摘要。不含封面和上线时间，需要时用 works_get。参数 account、platform 可选。",
    },
  },
  "works.get": {
    caller: "any",
    permission: "netease:works.read",
    risk: "read",
    mcp: {
      title: "作品详情",
      description:
        "按作品 ID 返回封面、上线和定时上架时间。只能查询本账号作品。已归档作品默认不读取，仅用户明确要求时传 includeArchived: true；不得自行绕过归档。account 可选。",
    },
  },
  "works.reviewFeedback": {
    caller: "any",
    permission: "netease:works.read",
    risk: "read",
    mcp: {
      title: "审核反馈",
      description:
        "返回作品最近一次审核的反馈文字和时间；没有时返回 null。仅本账号作品。默认不读取归档内容，仅用户明确要求时传 includeArchived: true；不得自行绕过归档。account 可选。",
    },
  },
};
