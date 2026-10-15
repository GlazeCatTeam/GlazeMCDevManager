export const categories = [
  { id: "appearance", label: "外观", description: "主题、颜色模式和界面大小" },
  { id: "general", label: "通用", description: "启动行为、账号与本地数据" },
  { id: "notifications", label: "通知", description: "选择需要提醒的消息与检查频率" },
  { id: "plugins", label: "插件", description: "管理内置功能和已安装的主题包" },
  { id: "ai", label: "AI 接入", description: "通过 MCP 让外部 AI 工具连接本应用" },
  { id: "logs", label: "日志", description: "查看和导出运行记录, 帮助排查问题" },
  { id: "about", label: "关于", description: "版本信息、更新与开源许可" },
] as const;

export type SettingsCategory = (typeof categories)[number]["id"];

export interface AppearanceSettings {
  themeId: "ore-ui" | "fluent-dark";
  colorMode: "dark" | "light" | "system";
  scale: 90 | 100 | 110 | 125;
}

export const initialAppearance: AppearanceSettings = { themeId: "ore-ui", colorMode: "dark", scale: 100 };

export interface GeneralSettings {
  launchAtLogin: boolean;
  startPage: "home" | "works" | "last";
  closeAction: "tray" | "quit";
}

export const initialGeneral: GeneralSettings = { launchAtLogin: false, startPage: "home", closeAction: "tray" };

export interface NotificationSettings {
  messages: boolean;
  feedback: boolean;
  lowStars: boolean;
  review: boolean;
  interval: 5 | 15 | 30;
}

export const initialNotifications: NotificationSettings = {
  messages: true,
  feedback: true,
  lowStars: true,
  review: true,
  interval: 15,
};

export const notificationItems = [
  { key: "messages", label: "新消息", description: "收到平台系统通知和重要消息时提醒" },
  { key: "feedback", label: "新反馈", description: "玩家提交新的问题或建议时提醒" },
  { key: "lowStars", label: "低星评论", description: "作品收到 1–2 星评论时提醒" },
  { key: "review", label: "审核结果", description: "作品审核通过或未通过时提醒" },
] as const;

export interface InstalledPlugin {
  id: string;
  name: string;
  description: string;
  required: boolean;
  enabled: boolean;
  kind: "builtin" | "theme";
}

export const initialPlugins: InstalledPlugin[] = [
  {
    id: "glaze.account",
    name: "账号管理",
    description: "登录、账号切换与会话管理",
    required: true,
    enabled: true,
    kind: "builtin",
  },
  { id: "glaze.home", name: "首页", description: "数据概览与收益速算", required: true, enabled: true, kind: "builtin" },
  {
    id: "glaze.works",
    name: "作品管理",
    description: "作品列表与上架管理",
    required: false,
    enabled: true,
    kind: "builtin",
  },
  {
    id: "glaze.analytics",
    name: "数据分析",
    description: "数据追踪、汇总与实时收益",
    required: false,
    enabled: true,
    kind: "builtin",
  },
  {
    id: "glaze.community",
    name: "玩家反馈与评论",
    description: "查看玩家意见并回复",
    required: false,
    enabled: true,
    kind: "builtin",
  },
  {
    id: "glaze.messages",
    name: "消息中心",
    description: "平台消息与审核通知",
    required: false,
    enabled: true,
    kind: "builtin",
  },
  {
    id: "glaze.settings",
    name: "设置",
    description: "应用偏好与扩展管理",
    required: true,
    enabled: true,
    kind: "builtin",
  },
  {
    id: "glaze.theme.ore-ui",
    name: "Ore UI",
    description: "方块风格 · 内置主题",
    required: true,
    enabled: true,
    kind: "theme",
  },
  {
    id: "glaze.theme.fluent-dark",
    name: "Fluent 深色",
    description: "简约、柔和 · 内置主题",
    required: true,
    enabled: true,
    kind: "theme",
  },
];

export interface PairedClient {
  id: string;
  name: string;
  lastSeen: string;
}

export const initialClients: PairedClient[] = [
  { id: "sample-claude", name: "Claude Code", lastSeen: "2026-10-15 10:24" },
  { id: "sample-codex", name: "Codex", lastSeen: "2026-10-14 21:08" },
];

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  message: string;
}

export const initialLogs: LogEntry[] = [
  { id: "log-1", time: "2026-10-15 10:32:08", level: "info", message: "应用界面初始化完成" },
  { id: "log-2", time: "2026-10-15 10:32:09", level: "info", message: "已加载 Ore UI 主题" },
  { id: "log-3", time: "2026-10-15 10:32:10", level: "info", message: "已加载 7 个内置功能插件" },
  { id: "log-4", time: "2026-10-15 10:32:11", level: "warn", message: "当前为界面预览, 业务数据使用模拟记录" },
  { id: "log-5", time: "2026-10-15 10:33:02", level: "error", message: "模拟: 数据请求超时, 请稍后重试" },
  { id: "log-6", time: "2026-10-15 10:33:06", level: "info", message: "模拟: 重试后数据加载完成" },
];

export const logLevelLabels: Record<LogLevel, string> = { info: "信息", warn: "警告", error: "错误" };

export type PendingAction =
  | { kind: "restore" }
  | { kind: "cache" }
  | { kind: "clearLogs" }
  | { kind: "revoke"; client: PairedClient };

export const confirmationCopy = {
  restore: {
    title: "恢复默认排版？",
    body: "将恢复所有页面的默认组件位置和大小。当前为界面预览，布局存储服务尚未接入。",
    action: "恢复默认",
  },
  cache: {
    title: "清除本地缓存？",
    body: "缓存清理服务尚未接入。本次仅预览操作流程，不会删除本地文件或账号凭据。",
    action: "确认预览",
  },
  clearLogs: {
    title: "清除模拟日志？",
    body: "将清空本页的模拟日志，刷新可重新加载。不会修改任何本地日志文件。",
    action: "清除",
  },
  revoke: {
    title: "撤销客户端授权？",
    body: "将移除此模拟客户端。真实 MCP 配对服务尚未接入，本次不会改变任何外部工具的权限。",
    action: "撤销授权",
  },
} as const;
