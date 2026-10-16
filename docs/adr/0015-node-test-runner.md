# ADR-0015 测试沿用 node:test，不引入 Vitest

- 状态：已接受
- 日期：2026-10-16
- 取代：[11 工程规范](../architecture/11-engineering.md) 原先"单元测试用 Vitest"的规划（未实际接入过）

## 背景

M0 原计划接入 Vitest，但一直没做。各模块在此期间各自写了 `tests/*.test.ts`，统一用 `node:test` 和 `node:assert/strict`，再由 `tools/test-*.mjs` 借桌面应用已安装的 Vite 打包后交给 `node --test` 运行，到 2026-10-16 共 301 项。另有两组测试（作品图片、作品资源上传）必须在 Electron 主进程里跑，要用到真实的 `BrowserWindow`、`nativeImage` 和沙箱 preload。

## 评估

| 方面 | 沿用 node:test | 改用 Vitest |
|---|---|---|
| 新依赖 | 无，Node 24 自带；打包复用桌面应用的 Vite | 新增 vitest 及其依赖 |
| 迁移成本 | 无 | 17 个测试文件的 `node:test` 导入、`afterEach`、子测试写法都要改 |
| Electron 宿主测试 | 打包成 CJS 后用 Electron 直接运行 | Vitest 跑在 Node 里，跑不了这两组，仍需单独脚本 |
| 速度 | 一次打包 + 并行文件，全部约 5 秒 | 相近 |
| 监听模式、覆盖率 | 没有现成界面；`node --test --experimental-test-coverage` 可做覆盖率 | 有 |

现有测试已能覆盖需要的场景，Vitest 多出的监听模式和覆盖率界面暂时用不上，不值得一次全量迁移。

## 决定

- 测试继续用 `node:test` + `node:assert/strict`，不引入 Vitest。
- `pnpm test` 运行 `tools/run-tests.mjs`：自动收集 `tests/*.test.ts`（已被其他测试文件导入的不重复运行），一次 Vite 打包后用 `node --test` 并行运行；`tools/run-tests.mjs` 中 `electronTests` 登记的测试分别打包为 CJS，交给 Electron 运行。`pnpm test mcp rank` 只跑指定的几组。
- 各模块原有的 `tools/test-*.mjs` 保留，用于单独调试。
- 界面回归继续用 Playwright，`pnpm test:ui` 运行 `tools/test-*-ui.mjs`，默认用系统自带的 Edge，不下载 Playwright 浏览器。

## 后果

- 新增测试只要放进 `tests/` 并命名为 `*.test.ts`，CI 就会自动运行；需要 Electron 主进程的测试要在 `electronTests` 里登记。
- 以后如果需要监听模式或覆盖率报告，再重新评估 Vitest；届时 Electron 宿主测试仍保留现在的运行方式。
