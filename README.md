# GlazeMCDevManager

Glaze MC Dev Manager：网易我的世界开发者管理工具（Windows 桌面端）。

账号管理、作品管理、数据分析、收益结算、反馈与评论、消息中心。业务范围参考 [MCDevManager](https://github.com/BitterLemonn/MCDevManager)，采用**宿主 + 插件**架构重新设计：排版可自由调整，主题可多套扩展，支持第三方插件。

## 状态

M0 工程骨架进行中：已初始化仓库、安装依赖，`pnpm dev` 可打开 Electron 窗口。

## 目录

| 目录 | 内容 |
|---|---|
| `apps/desktop` | Electron 应用（主进程、preload、Shell） |
| `packages/*` | 内核包：shared、contracts、core、netease、storage、theme、layout、ui、plugin-sdk |
| `plugins/*` | 内置插件：home、account、works、analytics、income、community、messages、settings |
| `themes/*` | 内置主题：ore-ui、fluent-dark |
| `tools` | 仓库脚本 |
| `tests/e2e` | 端到端测试 |
| `docs/architecture` | 架构文档 |
| `docs/adr` | 架构决策记录 |
| `docs/design/references` | 设计参考图 |

## 开始开发

需要 Node.js 24 和 pnpm：

```bash
npm install -g pnpm
pnpm install
pnpm dev
```

工具链与脚本详见 [工程规范](docs/architecture/11-engineering.md)。

## 文档

从 [架构文档总览](docs/architecture/README.md) 开始阅读。

## 许可证说明

本项目原创代码和文档采用 **[Apache License 2.0](LICENSE)**，版权与归属声明见 [NOTICE](NOTICE)。除另有声明的第三方材料外，仓库中的内置插件、主题实现及插件 SDK 均使用同一许可证。

- 允许使用、修改、商用和再分发，包括闭源衍生版本；不要求公开修改源码。
- 再分发时应提供许可证副本，保留适用的版权与归属声明，并在修改的文件中明确标注改动；随项目提供的适用 NOTICE 内容也应保留。
- 包含贡献者对条款所定义范围内的专利授权及专利诉讼终止条款；不授予项目或第三方商标的使用权（条款规定的来源描述等例外除外）。软件按原样提供，不附带条款以外的担保。

以上为阅读提示，以 [LICENSE](LICENSE) 英文原文为准。独立第三方插件可自行选择许可证；复用本项目代码时仍需遵守对应许可义务。

第三方依赖、图片、参考截图及其他另有归属的材料不因此改为 Apache-2.0。Minecraft 图标保留 Mojang 声明，见 [作品管理资源声明](plugins/works/src/assets/minecraft/LICENSE.md) 和 [数据分析资源声明](plugins/analytics/src/assets/minecraft/LICENSE.md)。应用“关于 → 查看许可”提供项目原文、NOTICE、第三方依赖与内置资源声明的离线查看。

本项目不包含 MCDevManager 的源码，只参考其功能与接口行为。MCDevManager 采用 BNCL-1.0 许可证，复用其代码前请阅读其条款。

本项目不是 Mojang、Microsoft 或网易的官方产品，名称与商标归各自权利人所有。
