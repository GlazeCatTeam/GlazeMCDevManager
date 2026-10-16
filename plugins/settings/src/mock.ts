import { type AppearanceSettings, defaultAppearance, defaultGeneral, type GeneralSettings } from "@glaze/plugin-sdk";

export type { AppearanceSettings, GeneralSettings } from "@glaze/plugin-sdk";

export const categories = [
  { id: "appearance", label: "外观", description: "主题、颜色模式和界面大小" },
  { id: "general", label: "通用", description: "启动行为、账号与本地数据" },
  { id: "plugins", label: "插件", description: "管理内置功能和已安装的主题包" },
  { id: "logs", label: "日志", description: "查看和导出运行记录, 帮助排查问题" },
  { id: "about", label: "关于", description: "版本信息、更新与开源许可" },
] as const;

export type SettingsCategory = (typeof categories)[number]["id"];

export const initialAppearance: AppearanceSettings = { ...defaultAppearance };

export const initialGeneral: GeneralSettings = { ...defaultGeneral };

export type PendingAction = { kind: "restore" } | { kind: "cache" };

export const confirmationCopy = {
  restore: {
    title: "恢复默认排版？",
    body: "将清除保存的排版偏好，恢复首页排行榜的默认显示项。当前页面位置和大小固定；主题、颜色模式、缩放及账号数据不受影响。",
    action: "恢复默认",
  },
  cache: {
    title: "清除本地缓存？",
    body: "将清理页面资源、脚本、图片和查询缓存，后续访问时重新加载。账号、登录凭据、偏好设置与未保存的编辑内容会保留。",
    action: "清除缓存",
  },
} as const;
