# 外观设置实装

## 当前行为

- Ore UI 支持深色、浅色及跟随系统；Fluent 仅提供深色主题。
- 90%、100%、110%、125% 缩放随主题、颜色模式一同保存，应用重启后恢复。
- 设置在主进程成功写入 SQLite 后才应用；失败时保留原值并提示，控件在保存期间禁用以避免交错写入。
- 渲染进程读取保存值后显示页面，通过 `useLayoutEffect` 在绘制前应用主题。跟随系统监听系统颜色模式变化。
- 首页排行榜的默认显示项保存为布局覆盖。“恢复默认排版”清除布局覆盖，恢复默认三个榜单，不重置外观和账号。
- 页面组件的位置和大小仍为固定布局，当前不包含拖拽布局编辑器。设置说明和确认框明确这一范围。

## 存储与接口

- 沿用现有运行时数据库 `app.getPath("userData")/glaze.db`，新增第 2 版迁移：`settings`、`layouts`。
- 外观记录为 `settings(scope = app, key = appearance)`；排行榜覆盖为 `layouts(page = glaze.home/ranking, version = 1)`。
- 升级已有文件数据库前，通过 SQLite `VACUUM INTO` 创建 `.v<版本>.<时间戳>.bak` 备份。缺失、损坏或不兼容的偏好使用默认值；读取不会覆盖原始记录。
- `appearance.get/set`、`layout.getRanking/setRanking/reset` 仅接受主界面主框架调用，不向 MCP 暴露。
- 写入先验证主题、颜色模式、缩放及榜单集合。成功后发送 `appearance.changed` 或 `layout.rankingChanged`，同步已挂载界面。

## 验证

- `node tools/test-appearance.mjs`：真实 SQLite 关闭重开、无效参数、损坏记录、旧库迁移及备份、重置隔离、存储错误。
- `node tools/test-appearance-ui.mjs [Playwright 模块 URL] [浏览器 channel]`：离线界面使用模拟宿主，验证主题、系统模式、缩放、刷新、保存失败与重试、排版保存、取消与确认重置。
- `pnpm build` 后运行 `node tools/test-appearance-electron.mjs [Playwright 模块 URL]`：以临时用户目录启动真实桌面程序，验证 preload/RPC、参数校验、进程重启恢复和排版重置。
- `pnpm typecheck`、`pnpm build`，以及修改文件的 Biome 检查。

## 本次操作记录

1. 新增外观契约、偏好存储和服务，追加数据库迁移并接入主进程。
2. 接入渲染端启动恢复、保存反馈、主题应用及排行榜排版保存，更新设置文案。
3. 新增隔离数据库测试、离线界面夹具及 Electron 验证脚本；生成构建和测试缓存。
