# 08 数据与存储

## 存储位置

| 内容 | 位置 |
|---|---|
| 数据库 | `%APPDATA%/GlazeMCDevManager/data/glaze.sqlite` |
| 第三方插件 | `%APPDATA%/GlazeMCDevManager/plugins/<id>/<version>/` |
| 第三方主题 | `%APPDATA%/GlazeMCDevManager/themes/<id>/<version>/` |
| 日志 | `%APPDATA%/GlazeMCDevManager/logs/`（按天滚动，保留 14 天） |
| 缓存 | `%APPDATA%/GlazeMCDevManager/cache/`（可随时清空） |

## 技术选型

- SQLite，驱动用 `better-sqlite3`（同步 API，性能好，适合主进程内单连接使用）。
- 表结构和迁移用 Drizzle ORM 与 drizzle-kit 管理，迁移文件随代码提交。
- 数据库只由主进程访问，渲染进程和插件通过 RPC 间接读写。

## 表设计

| 表 | 主要字段 | 说明 |
|---|---|---|
| `accounts` | `uid` 主键、`nickname`、`avatar_url`、`email`、`login_method`、`last_login_at`、`is_last_active` | 账号元数据，不含凭据 |
| `credentials` | `uid` 主键、`session_blob`、`password_blob`、`updated_at` | **加密字段**，只有 `@glaze/storage` 的保险箱模块能读写 |
| `settings` | `scope`（`app` 或插件 ID）、`key`、`value_json` | 应用和插件设置 |
| `layouts` | `page`、`version`、`layout_json`、`updated_at` | 用户布局覆盖，没有记录即使用默认布局 |
| `plugins` | `id`、`version`、`trust`、`enabled`、`granted_permissions_json`、`installed_at` | 已安装插件和授权情况 |
| `plugin_kv` | `plugin_id`、`key`、`value_json` | 插件私有存储，按插件隔离 |
| `query_cache` | `account_uid`、`endpoint`、`params_hash`、`payload_json`、`fetched_at` | 可选的接口结果缓存，按账号隔离 |
| `audit_log` | `at`、`caller`、`permission`、`target`、`result` | 权限判定和高危操作记录 |

## 凭据加密

- 使用 Electron `safeStorage`（Windows 上由 DPAPI 实现，绑定当前 Windows 用户）。
- 加密只发生在主进程的保险箱模块；其他模块只能调用"保存会话 / 读取会话 / 删除"，拿不到密钥。
- 导出或备份数据库时，`credentials` 表不导出。
- 删除账号时同时删除对应凭据和缓存。

## 缓存策略

- 接口数据在渲染进程用 TanStack Query 做内存缓存（按账号 UID 区分查询键）。
- 需要离线查看或计算量大的数据（例如历史日数据）写入 `query_cache`，带获取时间，界面显示"数据更新于…"。
- 切换账号时，内存缓存按账号键自然隔离；退出登录时清除该账号的缓存。

## 迁移规则

- 每次表结构变化都生成迁移文件，启动时自动执行，执行前备份数据库文件。
- 迁移失败时停止启动并提示用户，保留备份，不带着半迁移的数据库运行。
