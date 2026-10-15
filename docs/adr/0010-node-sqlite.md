# ADR-0010 SQLite 驱动改用 Electron 内置的 node:sqlite

- 状态：已接受
- 日期：2026-10-15
- 取代：ADR-0007 中"驱动为 better-sqlite3，用 Drizzle 管理迁移"的部分；"本地存储使用 SQLite、只由主进程访问"不变

## 背景

better-sqlite3 是原生模块，要针对 Electron 44 重新编译，需要本机装 VS 构建工具，新版本 Electron 也常常没有预编译包。Electron 44 自带 Node 24，已经内置 `node:sqlite`（同步 API，和 better-sqlite3 用法接近）。

## 决定

- 数据库驱动用 `node:sqlite` 的 `DatabaseSync`，不引入原生模块。
- 暂不使用 Drizzle：迁移写成按顺序追加的 SQL（`packages/storage/src/migrations`），版本记在 `schema_version` 表，已发布的迁移不修改。
- 数据库文件放在 `userData/glaze.db`，开启 WAL 和外键。

## 后果

- 安装和打包不再需要编译原生模块。
- `node:sqlite` 在 Node 24 仍标为实验性，接口变化时只影响 `@glaze/storage` 一个包。
- 表结构变多后如果手写 SQL 不好维护，再评估是否引入查询构建器。
