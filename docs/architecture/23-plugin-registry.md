# 23 插件注册表与插件开发

更新日期：2026-10-16。决定见 [ADR-0014](../adr/0014-plugin-registry-driven-shell.md)。外壳不再引用任何具体插件：页面、导航、设置分区、首页组件和 MCP 工具全部由插件清单声明、由插件模块实现。本文是写一个内置插件所需的全部约定。

## 一个插件由什么组成

```
plugins/<名称>/
├─ glaze-plugin.json   清单：声明有什么
├─ package.json        @glaze/plugin-<名称>，只依赖 @glaze/plugin-sdk
└─ src/index.ts(x)     默认导出 definePlugin(...)：提供每个声明 ID 的代码
```

外壳在构建时扫描 `plugins/*/glaze-plugin.json`，按清单的 `entries.ui`（默认 `src/index.ts`）配对插件模块，模块只在需要时加载。新增内置插件不需要改外壳任何代码。

## 清单

类型定义在 `@glaze/contracts` 的 `plugin-manifest.ts`（`PluginManifest`）。示例（数据分析插件，节选）：

```json
{
  "id": "glaze.analytics",
  "name": "数据分析",
  "entries": { "ui": "src/index.ts" },
  "activationEvents": ["onPage:analytics"],
  "contributes": {
    "pages": [{ "id": "analytics", "title": "数据分析" }],
    "navItems": [{ "page": "analytics", "icon": "nav.analytics", "group": "top", "order": 30, "section": "数据与收益" }],
    "tools": [
      {
        "id": "top_sellers",
        "title": "热销作品排行",
        "risk": "read",
        "permission": "netease:analytics.read",
        "description": "按最近若干天的钻石收益、新增购买或销售总量列出手机版作品排行……",
        "input": {
          "type": "object",
          "properties": {
            "days": { "type": "integer", "minimum": 1, "maximum": 30 },
            "sortBy": { "type": "string", "enum": ["diamonds", "purchases", "downloads"] }
          }
        }
      }
    ]
  },
  "permissions": ["netease:analytics.read", "netease:works.read", "netease:income.read", "storage"]
}
```

| 贡献点 | 字段 | 外壳行为 |
|---|---|---|
| `pages` | `id`、`title`、`chrome?: "none"` | 路由键为 `<插件 ID>/<页面 ID>`；`chrome: "none"` 不显示侧边栏 |
| `navItems` | `page`、`icon`、`group`、`order`、`section?` | `top` 项按 `section` 分组，分组顺序取组内最小 `order`，未分组的进「其他功能」；`bottom` 项放在底部 |
| `settingsSections` | `id`、`title`、`description`、`order` | 显示在设置页「插件」之后；可用 `navigate("glaze.settings/settings", { category: "<插件 ID>/<分区 ID>" })` 直达 |
| `homeWidgets` | `id`、`title`、`order` | 首页内置面板下方的扩展行，每格固定 168px 高 |
| `tools` | 见下文 | 注册为 MCP 工具 |
| `activationEvents` | `onStartup` | 插件启用时在启动后加载模块并调用 `activate()`，停用时调用其返回的清理函数 |

插件停用后，它的导航、页面、设置分区、首页组件和工具都会隐藏，页面入口显示「此插件已停用」。

## 插件模块

```ts
import { definePlugin } from "@glaze/plugin-sdk";

export default definePlugin({
  pages: { analytics: AnalyticsPage },          // 页面 ID → 组件
  settingsSections: { "ai-service": Section },  // 设置分区 ID → 组件
  homeWidgets: { status: StatusWidget },        // 首页组件 ID → 组件
  tools: { top_sellers: topSellers },           // 工具 ID → 处理函数
  prefetch: { analytics: (prefetch) => prefetch("works.list", { platform: "pe" }) }, // 悬停导航时预热
  activate: () => startWarmup(),                // 配合 onStartup，返回清理函数
});
```

清单声明了但模块没实现的页面显示占位，没实现的分区或组件不渲染。插件可以继续导出具名组件，供测试和预览使用。

## 读取数据

一律用 SDK：`useHostQuery` 读宿主能力（统一缓存、跨页面复用、后台刷新），需要自管分页或详情时用 `QueryCache`，详见 [04 插件系统](04-plugin-system.md)「数据加载」。不要自己写缓存或直接 `fetch`。

## 插件贡献的 MCP 工具

1. 清单 `tools` 声明 `id`（小写字母开头，最多 40 位）、`title`、`description`（写给 AI 看）、`risk`（`read`/`write`）、`permission`（单个 MCP 权限，必须同时写在插件 `permissions` 里；只读工具只能用查看类权限）、可选 `input`（扁平对象，字段类型 string/number/integer/boolean/字符串数组，支持 enum、范围、长度、必填）。`validatePluginTools` 在主进程校验，不合法的工具不注册并记日志。
2. MCP 名称为 `plugin_<插件短名>_<工具 ID>`，例如 `plugin_analytics_top_sellers`；描述前加「来自插件「名称」」。缺权限时与内置工具一样走 AI 授权弹窗。
3. 调用时主进程把 `{ callId, pluginId, toolId, params, account, permissions }` 发给主窗口（事件 `plugins.toolCall`），`permissions` 是插件权限与该 AI 客户端当前授权的交集。外壳 `PluginRuntime` 加载插件模块并执行处理函数：

```ts
export const topSellers: PluginToolHandler = async (params, ctx) => {
  const works = await ctx.callHost("works.list", { account: ctx.account ?? undefined, platform: "pe" });
  if (!works.ok) throw new Error(works.error.message);
  // ……汇总后直接返回结构化结果
};
```

   `ctx.callHost` 只放行 `caller: "any"` 且权限在 `permissions` 内的能力，账号管理类能力永远拒绝。处理函数抛错或返回值都会经 `plugins.toolResult` 回传；窗口未打开或超过 30 秒会返回明确错误。
4. 写工具（`risk: "write"`）沿用业务写入的幂等键、结果未知不重试和审计。

## 外壳结构

| 文件 | 职责 |
|---|---|
| `apps/desktop/src/renderer/plugins/catalog.ts` | 扫描清单、配对模块、按需加载与失败重试；提供给 SDK 的 `PluginCatalog` |
| `apps/desktop/src/renderer/shell/nav.ts` | 从清单生成导航项与页面信息 |
| `apps/desktop/src/renderer/routes/pages.tsx` | 路由解析为插件页面组件，悬停预载代码并调用插件 `prefetch` |
| `apps/desktop/src/renderer/plugins/PluginRuntime.tsx` | 执行插件 MCP 工具、启停 `onStartup` 插件 |
| `apps/desktop/src/renderer/shell/AccessRequestDialog.tsx` | AI 授权弹窗（宿主职责，不随插件停用） |
| `packages/plugin-sdk/src/plugin.ts`、`context/catalog.tsx`、`context/appearance.ts` | `definePlugin`、`useContributions`、`HostAppearance` |

## 现有内置插件的贡献

| 插件 | 页面 | 其他贡献 |
|---|---|---|
| 账号 `glaze.account` | 账号管理、登录、重新登录 | — |
| 首页 `glaze.home` | 首页 | 渲染扩展行 |
| 作品 `glaze.works` | 作品管理 | `onStartup` 预热作品列表 |
| 数据分析 `glaze.analytics` | 数据分析 | MCP 工具 `plugin_analytics_top_sellers` |
| AI 助手 `glaze.assistant` | AI 助手 | 设置分区「AI 连接服务」、首页组件「AI 助手」 |
| 设置 `glaze.settings` | 设置 | 渲染其他插件的设置分区 |
| 收益、活动推广、玩家反馈与评论、系统消息 | 各自页面 | — |
