# ADR-0007 本地存储使用 SQLite（better-sqlite3）

- 状态：已接受
- 日期：2026-10-15

## 背景

需要保存账号元数据、加密凭据、设置、用户布局、插件状态、插件私有数据和接口缓存，并支持版本迁移。

## 决定

使用 SQLite，驱动为 better-sqlite3，表结构和迁移用 Drizzle ORM 与 drizzle-kit 管理。数据库只由主进程访问。

## 后果

- 单文件、事务可靠、迁移可控，适合桌面应用。
- better-sqlite3 是原生模块，需要针对 Electron 版本重新编译（electron-builder 会处理）。
- 同步 API 在主进程中执行，耗时查询需要控制，大批量操作放到 worker 中。
