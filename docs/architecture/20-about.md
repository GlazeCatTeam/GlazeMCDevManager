# 20 关于页面

## 范围

设置 → 关于接入真实版本、运行环境、项目主页、问题反馈、第三方许可与参考项目。更新检查和自动检查选项仍沿用原来的预览状态，本轮不实现更新服务。

项目仓库为 `https://github.com/GlazeCatTeam/GlazeMCDevManager`，反馈入口为该仓库的 `/issues`。参考项目为 `https://github.com/BitterLemonn/MCDevManager`，只参考行为和接口，不包含其源码。用户授权选用 Apache-2.0，适用于项目原创代码和文档，包括内置插件、主题实现和 SDK；另有声明的第三方材料保留原许可。

## 能力与边界

| 能力 | 内容 | 调用与风险 |
|---|---|---|
| `app.getAbout` | 应用版本、开发/打包状态、平台和架构、Electron / Chromium / Node.js 版本、项目许可证 ID、摘要、完整原文与 NOTICE | read，无账号权限；已接入 MCP 只读工具 |
| `app.getLicenses` | 构建时收集的生产依赖、Electron 与内置第三方资源版本、许可标识、完整许可/NOTICE 文本 | read，无账号权限；已接入 MCP 只读工具 |
| `app.openProjectLink` | 仅接收 `homepage`、`feedback`、`reference` 三个 ID，由宿主映射固定 HTTPS 地址 | write，仅主界面；不接受任意 URL |
| `app.openRuntimeNotices` | 打开 Electron 可执行文件旁的 `LICENSES.chromium.html` | write，仅主界面；不接受文件路径 |

四项 IPC 均校验来源为应用主窗口的主 frame。插件页面通过 SDK 调用；MCP 服务复用只读能力，不直接触发桌面浏览器。所有打开错误返回明确提示，读取失败支持重试。

开发态使用桌面应用 `package.json` 的版本，避免 Electron 默认应用版本混入；打包态使用 `app.getVersion()`。运行环境由主进程读取，不含用户名、本地路径或账号信息。

## 许可生成与分发

仓库根目录 `LICENSE` 使用 Apache 官方标准原文，不添加自定义限制。`NOTICE` 标注贡献者、维护组织与第三方归属；所有 workspace 包声明 `license: Apache-2.0`。README 说明允许商用与闭源衍生、保留声明和修改标记等要求，并指向英文原文。

构建从根目录读取 LICENSE 和 NOTICE，嵌入主进程用于离线查看，同时输出到 `apps/desktop/out/main/`，避免界面文案与实际条款分叉。许可弹窗先展示项目摘要，可展开原文与归属声明，再列第三方依赖和资源。摘要只用于帮助阅读，不修改原始条款。

`apps/desktop/build/license-notices.ts` 从桌面应用遍历生产依赖、workspace 依赖和已安装的可选依赖，去重后收集包根目录的 LICENSE、COPYING、NOTICE 文件，另外收集 Electron 自身许可。Electron 的下载器依赖属于构建工具，不作为应用运行依赖列入。

作品管理和数据分析中的 Minecraft 图标原有 Mojang 声明保持原样，构建时读取各自的 `LICENSE.md` 并纳入资源清单，明确排除在项目 Apache 授权范围之外。参考截图及其他第三方材料同样不因根目录许可而重新授权。

配置加载时将清单嵌入主进程构建，无运行时 node_modules 路径依赖。缺少生产依赖或许可原文时构建失败，避免展示空的许可承诺。升级依赖后重新构建即可同步清单。

Chromium 及运行时包含的其他第三方组件使用 Electron 自带的 `LICENSES.chromium.html` 完整声明，按固定路径离线打开。后续打包必须保留该文件；缺失或打开失败时提示错误，不把失败显示为成功。安装包（[11 工程规范](11-engineering.md)「安装包」）把项目 `LICENSE`、`NOTICE` 放在可执行文件旁，Electron 的 `LICENSES.chromium.html` 和 `LICENSE.electron.txt` 也保留在同一目录；2026-10-16 已静默安装核对这四个文件。

## 验证与操作记录

1. 定义四项能力、权限边界和 SDK 类型。
2. 接入主进程版本、固定外链、离线许可清单及运行时文件打开。
3. 替换关于页占位行为，增加许可弹窗、失败提示和重试，沿用主题与固定内容框。
4. 通过 `tools/test-about-electron.mjs` 在独立 Electron 配置中验证真实 IPC 与界面；网络和浏览器打开均使用桩，不操作真实账号。

测试覆盖开发态版本、实际运行时版本、完整依赖许可、非法链接及非主窗口拒绝、三个固定目的地址、原生打开失败、信息与许可读取重试、许可展开、小窗口布局与更新占位保留。项目许可证与 NOTICE 在仓库、构建输出、IPC 和页面展开文本之间逐字核对；两处 Minecraft 声明独立保留并逐字核对。

`tools/test-license-ui.mjs` 提供独立离线页面验证，覆盖项目许可读取失败重试、原文与 NOTICE 展开、资源声明和短窗口滚动；用于其他模块尚在修改时也能单独验证许可界面。2026-10-16 两套回归、全仓类型检查、桌面构建及变更代码 Biome 均通过。

许可依据：[Apache License 2.0 原文](https://www.apache.org/licenses/LICENSE-2.0.txt) 与 [Apache 官方许可 FAQ](https://www.apache.org/foundation/license-faq.html)。每次发布前仍需按 11 工程规范的安装包验证步骤核对上述文件。
