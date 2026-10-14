# 11 工程规范

## 工具链

| 用途 | 工具 |
|---|---|
| 运行时 | Node.js 24（见 `.nvmrc`） |
| 包管理 | pnpm（workspaces） |
| 任务编排 | Turborepo |
| 语言 | TypeScript（严格模式，配置见 `tsconfig.base.json`） |
| 桌面构建 | electron-vite |
| 打包与更新 | electron-builder（NSIS 安装包）、electron-updater |
| 代码检查与格式化 | Biome |
| 单元测试 | Vitest |
| 端到端测试 | Playwright（Electron 模式） |
| 依赖边界检查 | `tools/` 中的检查脚本（规则见 [03 模块与依赖规则](03-modules.md)） |

## 环境准备

```bash
npm install -g pnpm
pnpm install
pnpm dev
```

> 新增依赖用 `pnpm add`，由 pnpm 解析当时的最新稳定版本并写入 `pnpm-lock.yaml`。Electron 二进制在首次运行时自动下载，无需批准安装脚本。

## 根目录脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动桌面应用开发模式 |
| `pnpm build` | 构建所有包 |
| `pnpm typecheck` | 全仓库类型检查 |
| `pnpm test` | 运行单元测试 |
| `pnpm lint` | Biome 检查 |
| `pnpm format` | Biome 格式化 |

## 测试策略

| 层级 | 覆盖对象 | 工具 |
|---|---|---|
| 单元测试 | 登录协议各步骤、Cookie 解析、收益规则、端点响应解析、主题令牌解析、布局合并与迁移 | Vitest |
| 契约测试 | 每个 RPC 方法的参数和返回 schema、权限声明 | Vitest |
| 集成测试 | 会话切换（并发、回滚、代次丢弃）、插件加载与权限判定 | Vitest + 模拟网易服务 |
| 端到端测试 | 启动路由（首次 / 过期 / 有效）、登录流程、布局编辑、主题切换 | Playwright |

- 网易接口测试使用录制的请求响应样本，不在 CI 中访问真实平台，不提交任何真实凭据。
- 收益规则必须覆盖档位边界和统计窗口边界。

## 持续集成

拉取请求和推送主分支时执行：

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm typecheck`
4. 依赖边界检查
5. `pnpm test`
6. 主题校验

发布由打标签触发：构建 Windows 安装包和便携版，签名后上传到 GitHub Releases，并生成更新元数据。

## 代码规范

- 新增或修改的函数写一句简短说明，说明用途而不是复述实现。
- 代码注释用英文标点，短注释末尾不加句号。
- 跨边界的数据一律用 `@glaze/contracts` 中的 schema 校验，不手写类型断言。
- 可能失败的操作返回 `Result`，不要用返回 `null` 或 `0` 表示失败。
- 组件只使用设计令牌，不写死颜色、圆角和阴影。
- 用最小改动完成需求，有实际复用需求时再提取模块。

## 提交规范

- 前缀用英文：`feat:`、`fix:`、`docs:`、`style:`、`refactor:`、`test:`、`chore:`，前缀后空一格，正文用中文。
- 例子：`feat: 添加会话切换回滚`、`docs: 补充插件权限说明`。
- 一次提交只做一件事；架构相关的变更附带文档更新。

## 分支

- `main` 始终可构建、可发布。
- 功能开发在 `feat/<简述>` 分支，通过拉取请求合并，CI 全部通过才能合并。
