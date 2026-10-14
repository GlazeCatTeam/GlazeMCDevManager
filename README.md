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

本项目不包含 MCDevManager 的源码，只参考其功能与接口行为。MCDevManager 采用 BNCL-1.0 许可证，复用其代码前请阅读其条款。
