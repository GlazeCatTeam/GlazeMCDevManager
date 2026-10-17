# 消息中心数据接入

## 数据链路

`plugins/messages` → `@glaze/plugin-sdk` → Electron RPC → 会话管理器 → `packages/netease/src/endpoints/messages.ts`。
渲染进程只接收消息字段, 不接触 Cookie。消息 RPC 仅允许应用主窗口的主 frame 调用。

| 能力 | 平台请求 | 行为 |
| --- | --- | --- |
| `messages.list` | GET `/mailbox` | start/span 分页, title/have_read/mail_type 服务端筛选, initLoad=true 获取统计 |
| `messages.unreadCount` | GET `/mailbox/unread/count` | 独立查询账号未读数; 页面使用列表返回的聚合统计 |
| `messages.get` | GET `/mailbox/{id}` | 返回 detail/sender/extra_list; 平台自动将该消息标为已读 |
| `messages.markAllRead` | POST `/mailbox/read_mail/` | 显式发送 mail_id_list=[] 和 read_all=true, 范围为整个账号 |
| `messages.delete` | POST `/mailbox/delete_many/` | 仅发送确认框捕获的 mail_id_list |

字段依据仓库 `docs/reference/netease-api-catalog.json` 中的 MailListVO、MailListContentVO、MailContentVO、MailCountsVO 和 UnReadMailVO。
详情自动已读行为核对了[参考项目 MailboxViewModel](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/mailbox/MailboxViewModel.kt)。

## 页面行为

- 每页 20 条, 「加载更多」按服务端偏移继续查询, 重复 ID 去重显示; 搜索延迟 250ms。
- 未读总量及类型统计使用平台聚合字段, 缺失时保留未知状态, 不将当前页计数冒充总量。
- 侧边栏「系统消息」使用 `messages.unreadCount` 显示当前账号的未读红点, 大于零显示、归零隐藏。复用 SDK 账号隔离缓存及本窗口/AI 写入后的刷新; 窗口可见时每分钟检查, 聚焦或恢复可见时立即检查。请求失败保留上次有效状态, 不将错误当作零; 未登录、会话过期或插件停用时卸载查询与定时器。
- 不自动打开首条消息。用户打开详情且成功后才更新已读状态; 未读筛选下刷新列表, 详情保持显示。
- 删除已读仅针对当前已加载的已读消息, 单条删除与批量删除均确认后提交。失败保留列表及确认框, 不自动重试写请求。
- 所有会改变状态的操作绑定发起时的账号, 主进程检查它仍为当前账号。账号切换会重建页面, 清空旧详情、筛选、确认框, 丢弃旧请求结果。
- 正文和附加信息以纯文本显示, 不执行平台 HTML, 保留段落换行。
- 当前消息能力仅供桌面应用使用, 未对 MCP 开放。

## 验证与操作记录

1. 新增消息契约和网易适配器, 将能力接入 RPC、权限元数据及 SDK 导出, 保留工作区其他模块的改动。
2. 删除生产模拟数据文件, 替换消息页面与组件, 增加账号隔离、分页、错误处理及删除确认。
3. 新增 `tests/messages.test.ts`、`tools/test-messages.mjs` 和 `tests/fixtures/messages.html`/`messages-preview.tsx`。
4. `node tools/test-messages.mjs`: 9 项离线接口回归通过, 包括参数、请求体、路径、空值、过期及失败语义。
5. 浏览器离线验收: 分页 20→25 条、搜索空态、详情失败重试、未读 16→15、删除失败保留和成功移除、全部已读、延迟请求时切换账号。打开详情后保留已加载分页; 未读筛选下列表从 15→14 条且详情继续显示。
6. 最终 `pnpm typecheck` 全部 18 项通过, `pnpm build` 通过, 本次变更文件 Biome 检查及 `git diff --check` 通过。中途反馈模块的并行改动曾导致检查报错, 最终检查时已消除。

验收未使用真实账号 Cookie, 未向网易发送真实已读或删除请求。真实平台数据仍需在已登录客户端中核验。
