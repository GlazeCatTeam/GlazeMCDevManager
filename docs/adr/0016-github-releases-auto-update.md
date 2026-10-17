# ADR-0016 通过 GitHub Releases 发布，electron-updater 自动更新

- 状态：已接受
- 日期：2026-10-16
- 补充（2026-10-17，决定 #81）：撤销当天的个人仓库迁移，同一个仓库已迁回 `GlazeCatTeam/GlazeMCDevManager`，发布配置和链接恢复团队归属；原团队版本继续使用原更新地址。保留全部历史版本附件，维护约束见 [11 工程规范](../architecture/11-engineering.md)「发布与更新」。
- 取代：[11 工程规范](../architecture/11-engineering.md) 原发布计划中「签名后上传、同时提供便携版」的部分

## 背景

首个公开版本 v0.1.0 需要一个用户能找到的下载地址，以及之后的升级方式。仓库 `GlazeCatTeam/GlazeMCDevManager` 是公开的，项目没有自建服务器（见 PROJECT「当前不做」），也还没有代码签名证书。关于页的「检查更新」此前一直是占位。

## 决定

1. **分发**：安装包和更新元数据（`latest.yml`、`.blockmap`）放在 GitHub Releases。推送 `v<版本>` 标签后，`.github/workflows/release.yml` 校验标签与 `apps/desktop/package.json` 版本一致、`docs/releases/v<版本>.md` 存在，跑类型检查、Biome、测试，然后 `electron-builder --publish always` 上传为**草稿** Release。维护者检查草稿后手动发布，草稿对用户和更新程序都不可见。
2. **更新**：主进程 `UpdateService` 用 electron-updater 读取同一个 Release。启动 15 秒后检查一次，之后每 6 小时检查一次，可在 设置 → 关于 关闭。发现新版本就在后台下载，下载完成后提示「重启并安装」，确认后静默安装并自动重启。用户不重启时，下次正常退出也会安装。开发版和免安装版返回 `unsupported`，界面改为提供发布页链接。
3. **能力与 MCP**：`update.state`、`update.check` 是只读能力，开放给 MCP。检查和下载不改用户数据，也不会安装。`update.install` 会关闭窗口、丢弃未保存内容，`update.setAutoCheck` 是用户偏好，两者都是 shellOnly，只有用户能在界面里操作。
4. **签名**：第一版不签名，安装时 SmartScreen 会提示，在 Release 说明里写清操作方法。electron-updater 没有配置 `publisherName`，因此不校验签名，只校验 `latest.yml` 里的 sha512。
5. **版本号**：首版为 0.1.0。之后每次发布都要提升 `apps/desktop/package.json` 的版本，并新增对应的更新说明。

## 后果

- 用户第一次安装要手动下载。之后的版本在后台到位，重启即可完成升级，不需要再去下载页。
- electron-updater 打进主进程包，安装包仍然不带 `node_modules`。它的依赖 `lazy-val` 没有附许可原文，许可收集里单独登记为按声明生成的 MIT 文本，其他依赖缺少原文时构建照样失败。
- 没有签名时，下载被篡改的风险只靠 HTTPS 和 sha512 兜底。拿到证书后在 `electron-builder.yml` 配置签名和 `publisherName`，electron-updater 就会开始校验发布者。
- 暂不提供便携版。便携版无法自我更新，会多出一种需要说明的分发形态。
