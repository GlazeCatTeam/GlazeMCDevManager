# tools

仓库脚本：依赖边界检查、主题校验、插件打包等。

脚本在需要时添加，并在根目录 package.json 中注册命令。

- `run-tests.mjs`：`pnpm test` 的入口，收集 `tests/*.test.ts` 打包后用 `node --test` 运行，Electron 宿主测试交给 Electron。
- `run-ui-tests.mjs`：`pnpm test:ui` 的入口，逐个运行 `test-*-ui.mjs`（`--electron` 加上 `test-*-electron.mjs`）。
- `test-*.mjs`：各模块原有的单独运行脚本，调试单个模块时使用。
