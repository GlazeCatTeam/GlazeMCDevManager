# ADR-0014 外壳由插件注册表驱动

- 状态：已接受
- 日期：2026-10-16
- 关联：落实 [ADR-0003](0003-everything-is-a-plugin.md)「一切业务皆插件」；PROJECT 决定 #67；细节见 [23 插件注册表与开发](../architecture/23-plugin-registry.md)

## 背景

插件清单里早就声明了页面、导航、组件、命令、设置，但外壳实际是写死的：`pages.tsx` 静态引入每个插件的页面组件，侧边栏分组写死在 `Sidebar.tsx`，作品预热、设置页的外观参数、AI 授权弹窗都是外壳里的特例。新增一个插件要改外壳代码，第三方插件将来也无法走同一条路。插件贡献 MCP 工具也只停留在设计上。

## 决定

1. **清单声明，模块实现**。`glaze-plugin.json` 声明有什么（页面、导航及分组 `section`、设置分区 `settingsSections`、首页组件 `homeWidgets`、MCP 工具 `tools`、激活事件），插件 UI 入口默认导出 `definePlugin({ pages, settingsSections, homeWidgets, tools, prefetch, activate })` 提供对应 ID 的代码。清单类型与工具校验在 `@glaze/contracts` 的 `plugin-manifest.ts`，主进程和渲染端共用。
2. **外壳只认注册表**。渲染端从清单构建目录（`renderer/plugins/catalog.ts`），按需加载插件模块；路由、侧边栏分组、悬停预载与数据预热、`onStartup` 激活全部由清单驱动，外壳不再引用任何具体插件。
3. **跨插件扩展点走 SDK**。设置页和首页通过 `useContributions("settingsSections" | "homeWidgets")` 渲染其他插件的贡献；外观状态经 SDK 的 `HostAppearance` 上下文提供，插件只依赖 `@glaze/plugin-sdk`。
4. **宿主职责回到宿主**。AI 授权弹窗属于安全提示，移到外壳，停用 AI 助手插件也不影响授权。
5. **插件贡献 MCP 工具**。清单声明工具（权限、风险、受限输入结构），主进程注册为 `plugin_<短名>_<工具>`，调用时把「插件权限 ∩ 客户端授权」随调用发给渲染端，渲染端在插件模块中执行，宿主调用在执行前按该权限集合过滤，结果回传给 AI。
6. 第三方代码插件的安装、独立进程宿主和沙箱仍不开放；内置插件属于 builtin 信任级别，渲染端执行工具不额外隔离。

## 后果

- 新增内置插件只需添加 `plugins/<名称>/`（清单 + 默认导出），不改外壳。
- 页面代码按插件拆分加载，首个页面在显示前预取，避免启动闪烁。
- 插件工具依赖应用窗口在线；窗口关闭或超时会返回明确错误。
- 将来开放第三方代码插件时，同一套清单与模块接口可直接沿用，但执行环境需要换成独立进程并在主进程复核权限。
- 新增贡献点（`settingsSections`、`homeWidgets`、`tools`、导航 `section`）属于插件 API 变更，`engines.glaze` 仍为 `^0.1.0`，正式开放第三方前再定版本策略。
