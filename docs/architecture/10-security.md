# 10 安全

## Electron 安全基线

所有窗口必须满足：

| 设置 | 值 |
|---|---|
| `contextIsolation` | `true` |
| `sandbox` | `true` |
| `nodeIntegration` | `false` |
| `webSecurity` | `true` |
| 远程内容 | 不加载任何远程页面；外部链接用系统浏览器打开；远程图片只经主进程的 `glaze-image:` 代理加载（[ADR-0011](../adr/0011-remote-image-proxy.md)） |
| CSP | `default-src 'self' glaze-asset:`，图片另允许 `glaze-image:`，禁止内联脚本和 `eval` |
| 导航 | 拦截 `will-navigate` 和 `window.open`，只允许应用内路由 |
| 权限请求 | 默认拒绝摄像头、麦克风、地理位置等 Web 权限 |

沙箱 iframe（自定义界面插件）额外使用 `sandbox="allow-scripts"`，不给 `allow-same-origin`，并有独立的 CSP。

## 资产与威胁

| 资产 | 威胁 | 对策 |
|---|---|---|
| 网易 Cookie / 密码 | 被插件读取、被日志记录、随其他请求外发、磁盘被拷走 | 只在主进程；插件只能按端点调用；日志脱敏；网易与公共 HTTP 客户端分离；DPAPI 加密 |
| 作品与收益数据 | 第三方插件越权读取或修改 | 端点级权限；高危操作二次确认；审计日志 |
| 用户电脑 | 插件执行任意代码 | 第三方代码在 utilityProcess 中禁用 Node 内置模块；文件和网络都经由宿主 |
| 应用更新 | 更新包被替换 | 只从 GitHub Releases 获取；校验签名和哈希；安全解压 |
| 插件包 | 恶意插件伪装 | 安装前显示发布者、权限；后续支持签名；可一键禁用和卸载 |
| MCP 入口 | 本机其他程序冒充 AI 工具调用；AI 被提示注入后误操作；AI 循环调用触发网易风控 | 默认关闭；HTTP 只监听 127.0.0.1 并校验 Host/Origin；新会话需在应用内授权；默认只读；按已授予的独立写权限直接执行、写入前复核；凭据能力不开放；限流；审计 |

## 日志脱敏

- pino 配置脱敏路径：`cookie`、`set-cookie`、`password`、`ticket`、`token` 等字段替换为 `[REDACTED]`。
- 网易请求日志只记录端点 ID、状态和耗时。
- 用户导出诊断日志时再做一次扫描，发现疑似凭据的字符串时阻止导出并提示。

## 权限审计

- 每次权限判定（允许或拒绝）写入 `audit_log`。
- 设置页提供"插件权限"视图：每个插件的已授予权限、最近调用记录、撤销授权。

## 开发约定

- 新增 IPC 方法必须声明权限或 `caller: "shell"`，评审时检查。
- 新增 IPC 方法必须声明 `risk`；设置 `mcp.expose` 时要检查返回值里没有凭据，`description` 写清副作用。
- 任何代码不得 `console.log` 网络请求头或响应体。
- 处理用户粘贴的 Cookie 时，只在内存中解析，验证通过后立刻加密保存，不写临时文件。
