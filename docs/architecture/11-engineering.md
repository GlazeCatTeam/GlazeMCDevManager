# 11 工程规范

## 工具链

| 用途 | 工具 |
|---|---|
| 运行时 | Node.js 24（见 `.nvmrc`） |
| 包管理 | pnpm（workspaces） |
| 任务编排 | Turborepo |
| 语言 | TypeScript（严格模式，配置见 `tsconfig.base.json`） |
| 桌面构建 | electron-vite |
| 打包与更新 | electron-builder（NSIS 安装包，见下文「安装包」）；electron-updater 待接入 |
| 代码检查与格式化 | Biome |
| 单元与集成测试 | `node:test` + `node:assert/strict`，由 Vite 打包后运行（不引入 Vitest，见 [ADR-0015](../adr/0015-node-test-runner.md)） |
| 界面回归 | Playwright（浏览器页面用系统 Edge；另有 Electron 模式脚本） |
| 持续集成 | GitHub Actions（`windows-latest`） |
| 依赖边界检查 | `tools/` 中的检查脚本（规则见 [03 模块与依赖规则](03-modules.md)） |

## 环境准备

```bash
npm install -g pnpm
pnpm install
pnpm dev
```

> 新增依赖用 `pnpm add`，由 pnpm 解析当时的最新稳定版本并写入 `pnpm-lock.yaml`。Electron 二进制在首次运行时自动下载，无需批准安装脚本。electron-builder 带来的 `electron-winstaller`（Squirrel 安装器）构建脚本在 `pnpm-workspace.yaml` 的 `allowBuilds` 中明确拒绝，本项目只用 NSIS。

## 根目录脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动桌面应用开发模式 |
| `pnpm build` | 构建所有包 |
| `pnpm dist` | 构建桌面应用并打 Windows x64 NSIS 安装包，输出到 `apps/desktop/release/` |
| `pnpm typecheck` | 全仓库类型检查 |
| `pnpm test` | 运行 `tests/` 下全部离线测试（`tools/run-tests.mjs`）；`pnpm test mcp rank` 只跑指定几组 |
| `pnpm test:ui` | 逐个运行 `tools/test-*-ui.mjs` 界面回归（`tools/run-ui-tests.mjs`）；加 `--electron` 同时跑 `test-*-electron.mjs`（需先 `pnpm build`），`--channel=chrome` 换浏览器 |
| `pnpm lint` | Biome 检查 |
| `pnpm format` | Biome 格式化 |

## 测试策略

| 层级 | 覆盖对象 | 工具 |
|---|---|---|
| 单元测试 | Cookie 解析、收益规则、端点响应解析、主题令牌解析、布局合并与迁移 | `node:test`（`tests/*.test.ts`） |
| 契约测试 | RPC 与 MCP 的参数和返回校验、权限声明 | `node:test` |
| 集成测试 | 会话切换、SQLite 偏好与迁移、插件加载与权限判定、MCP 服务 | `node:test` + 模拟网易服务 |
| Electron 宿主测试 | 原生图片裁剪、沙箱 preload 的文件桥 | Electron 主进程直接运行（`run-tests.mjs` 的 `electronTests`） |
| 界面回归 | 各页面交互与布局（`test-*-ui.mjs`）、真实 Electron 进程（`test-*-electron.mjs`） | Playwright |

- 网易接口测试使用录制的请求响应样本，不在 CI 中访问真实平台，不提交任何真实凭据。
- 收益规则必须覆盖档位边界和统计窗口边界。
- 新增测试放进 `tests/` 并命名为 `*.test.ts` 即被 `pnpm test` 收集；被其他测试文件 `import "./x.test"` 的文件只随导入方运行一次；需要 Electron 主进程的测试在 `tools/run-tests.mjs` 的 `electronTests` 里登记。
- 2026-10-16 基线：`pnpm test` 15 个 Node 测试文件共 301 项、2 个 Electron 宿主测试全部通过，约 5 秒。`pnpm test:ui` 15 个脚本中 11 个通过，`test-license-ui`、`test-mcp-ui`、`test-promotion-ui`、`test-rank-ui` 四个是稳定复现的既有失败（断言或选择器与当前界面不一致）；Electron 模式 6 个脚本中 `about`、`general`、`mcp`、`session-settings` 四个超时，暂不进 CI。

## 安装包

配置在 `apps/desktop/electron-builder.yml`，`pnpm dist` 先 `electron-vite build` 再打包。

| 项 | 取值 |
|---|---|
| 目标 | Windows x64 NSIS，`GlazeMCDevManager-<版本>-x64-setup.exe` |
| 应用 ID | `com.glaze.mcdevmanager`，与主进程 `app.setAppUserModelId` 一致；安装器给开始菜单和桌面快捷方式写入同一 AppUserModelID，Windows 通知与快捷方式归到同一应用 |
| 显示名 | Glaze MC Dev Manager（可执行文件、快捷方式、卸载项）；发布者取 `apps/desktop/package.json` 的 `author` |
| 安装方式 | 向导式（非一键），默认按当前用户安装，可改安装目录，创建桌面与开始菜单快捷方式 |
| 打包内容 | 只有 `out/**` 和 `package.json`；主进程只依赖 Node 内置模块，工作区包和第三方库都已打进 `out/`，`node_modules` 不进安装包，也不重建原生模块 |
| 许可文件 | 根目录 `LICENSE`、`NOTICE` 复制到可执行文件旁；Electron 自带的 `LICENSES.chromium.html`、`LICENSE.electron.txt` 保留在同一目录，供关于页打开（见 [20 关于页面](20-about.md)） |
| 语言包 | 只保留 `zh-CN`、`en-US` |
| 用户数据 | 应用名仍为 `@glaze/desktop`，安装版与开发版共用 `%APPDATA%\@glaze\desktop`：同一份账号与设置，也共用单实例锁，二者不能同时运行 |
| 签名 | 不签名（应用代码签名证书是待定事项）；未签名安装包可能被 SmartScreen 提示 |
| 图标 | 暂用 Electron 默认图标，待提供 `apps/desktop/resources/icon.ico` |

验证步骤（2026-10-16 本地已按此执行）：

1. `pnpm dist` 生成安装包（约 100 MB）。
2. 静默安装到临时目录：`GlazeMCDevManager-0.0.0-x64-setup.exe /S /D=<目录>`；确认目录中有 `LICENSE`、`NOTICE`、`LICENSES.chromium.html`、`LICENSE.electron.txt`，开始菜单与桌面快捷方式的 `System.AppUserModel.ID` 都是 `com.glaze.mcdevmanager`，卸载项发布者为 GlazeCatTeam。
3. 用 `--user-data-dir=<临时目录>` 启动已安装的程序，避免读到真实账号；确认 `app.isPackaged` 为 true、窗口进入登录页、无页面错误。
4. 运行 `Uninstall Glaze MC Dev Manager.exe /S /currentuser`，确认安装目录、快捷方式和卸载注册项都已清除。

## 持续集成

`.github/workflows/ci.yml`，推送 `main`、拉取请求和手动触发时运行，两个任务都在 `windows-latest` 上。公共准备步骤在 `.github/actions/setup`：按 `.nvmrc` 装 Node.js，按 `package.json` 的 `packageManager` 装同版本 pnpm，缓存 pnpm 存储，`pnpm install --frozen-lockfile`。

| 任务 | 步骤 |
|---|---|
| 类型检查、Biome、测试与构建 | `pnpm typecheck` → `pnpm lint`（`biome check .`）→ `pnpm test` → `pnpm build` |
| 界面回归（Playwright + Edge） | `pnpm test:ui`，用运行器自带的 Edge，不下载 Playwright 浏览器 |

- 界面回归是独立任务，不阻塞第一个任务；上面列出的四个既有失败修好之前它会是红的。
- 本机 act 无法模拟 `windows-latest`，提交前在不含 `node_modules` 和构建产物的干净副本里逐条执行了上述命令，结果与上表一致。本机副本路径过深时 Electron 会因 Windows 260 字符路径限制报 `Error loading V8 startup snapshot file`，GitHub 运行器路径较短不受影响。
- 暂未做：依赖边界检查、主题校验脚本、Electron 模式界面回归、安装包产物上传。

发布计划：打标签触发，构建 Windows 安装包和便携版，签名后上传到 GitHub Releases，并生成更新元数据（未实现，依赖代码签名证书和 electron-updater）。

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
