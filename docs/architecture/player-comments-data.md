# 玩家评论数据接入

2026-10-15: 玩家评论页由本地模拟数据切换为当前账号的网易 PE 评论列表。

## 查询链路

`CommentsPage → comments.list RPC → SessionManager.request → listComments → GET /items/comment/pe/`。

- RPC 使用 `netease:community.read` 权限, 仅应用界面可调用, 不新增 MCP 工具
- Cookie 留在主进程, 复用现有会话续期、过期和错误处理
- 参数校验覆盖分页、关键词、标签和成对日期; 每页 20 条, `start = page * 20`
- `keyword/tag/startDate/endDate` 映射到 `fuzzy_key/comment_tag/start_date/end_date`; 全部时间不传日期, 有日期时发送 `yyyyMMdd`
- `tag` 使用平台类型编号 (`0/10/20/30/40/50/60`), 不把列表返回的中文标签用作请求参数
- 日期采用运行设备的本地日历日期; 近 N 天包含今天, 起始日期为今天减 N−1 天
- `count/data` 映射为总条数和评论列表; 长整数 ID 保留为字符串; `publish_time` 按 Unix 秒转换
- 字段与响应结构以仓库 `docs/reference/netease-api-catalog.json` 中的 CommentData、CommentListVO 为依据

时间单位也核对了参考项目固定版本的 [toDateTimeString 实现](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/utils/extension/FunExt.kt#L142)。

## 页面行为

- 搜索防抖 300ms; 服务端筛选变化后回到第一页
- 未选择评分时直接按平台分页; 选择评分时按每批最多 100 条读取当前关键词、类型和日期条件下的评论, 每批返回后立即按评分筛选并以每页 20 条展示, 同时提示已检查数量与已找到的匹配数。加载完成前只标记为部分结果, 完成后才显示完整匹配总数。不向平台发送不支持的 `stars` 参数
- 评论类型使用官方页面的固定选项, 即使当前页未加载某种类型也可筛选
- 切换账号会重建页面状态; 改变查询条件会重建结果面板, 不显示上一查询的列表或详情
- 加载、错误重试、空列表、未登录均有独立提示; 总数缩小时回到有效页
- 同一查询刷新时保留上次成功的列表和详情直到更新完成, 失败时明确标注结果未刷新; 新筛选分批加载失败时保留该查询已收到的匹配评论并明确标为部分结果, 支持重试, 双栏布局仍保留
- 保留现有双栏固定高度和主题样式
- 当前账号页面内最多缓存 20 个查询结果, 有效期 30 秒; 评分筛选共享对应服务端查询的完整快照, 返回近期分页/筛选直接展示缓存, 过期结果先展示再更新
- 相同查询复用进行中的请求, 包括开发环境的 StrictMode effect 重放; 手动刷新使缓存过期并重新查询, 进行中禁止重复点击
- 评分和页码变化可订阅同一来源的进行中扫描, 立即接收最新批次; 查询不再被任何视图使用后停止请求后续批次, 已发出的单次请求返回后丢弃结果
- 回复成功后清除所有页面缓存和旧请求关联, 防止旧结果恢复未回复状态; 离开页面或切换账号销毁该缓存
- 评论列表及时间格式化结果只在数据或已确认回复变化时更新, 编辑回复草稿不会重新绘制整个列表; 评分变化回到第一页, 查询缓存与结果面板包含排序后的评分选项

## 回复链路

`CommentReplyForm → comments.reply RPC → SessionManager.request → replyComment → PUT /items/comment/pe/{id}/reply`。

- 参考 [GitHub CommentApi](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/CommentApi.kt) 和 [ReplyDTO](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/feedback/ReplyDTO.kt), 使用 PUT, JSON body 只有 `content`
- 官方评论页面对回复限制为 100 字; UI 与主进程合同均检查空白及长度, 请求正文去除首尾空白
- `comments.reply` 使用 `netease:community.write`, 仅主界面调用, 不向 MCP 暴露
- 主进程检查请求账号仍是当前账号, Cookie 仍只在主进程使用; 评论 ID 只允许安全的不透明标识符
- 回复框固定在详情底部; 草稿和发送结果以评论 ID 保存在当前账号页面内, 翻页和筛选保留, 切换账号清空
- 请求期间禁止重复发送, 成功后才清空原评论草稿、展示回复并刷新列表; 失败保留草稿, 网络结果不确定时提示先刷新核实, 不自动重试写请求
- 按官方页面的会话语义读取 `developer_reply`, 非空数组表示请求账号已回复; `commented_num` 不参与当前账号的回复判断。展示数组中首个有效文字回复, 标题为“当前账号的回复”; 缺少内容时明确提示, 缺少时间时不编造回复时间
- 页面仍不把缺少回复字段的评论批量标为“未回复”; 是否允许实际提交由网易接口最终校验

## 验证与操作记录

1. 新增评论 RPC 合同、运行时校验和网易适配器; 在合同导出、SDK、能力表和主进程注册查询
2. 替换评论页面的数据来源, 新增日期与展示映射, 为共享列表增加可选回复状态显示开关
3. 新增 `tests/comments.test.ts`、`tools/test-comments.mjs` 和 `tests/fixtures/comments*` 离线预览
4. `node tools/test-comments.mjs`: 覆盖请求参数、长整数、异常响应、错误传播、日期边界、权限, 以及 7 个类型编码和中文标签拒绝回归
5. 浏览器使用离线接口桩验证分页、关键词/日期/标签组合筛选、评分空结果翻页、失败重试、慢请求切换账号及退出账号
6. 本次新增及修改的评论文件通过 Biome, 桌面端生产构建通过, `git diff --check` 通过
7. 本次筛选修复后的全仓类型检查和桌面生产构建均通过, 先前并行反馈代码中的类型错误已不存在

离线预览: 运行 `node tools/preview-work-editor.mjs`, 打开 `http://127.0.0.1:5187/tests/fixtures/comments.html`。预览只替换桥接层, 不连接真实账号或发送平台请求。真实网易账号联调尚未执行。

## 筛选失败修复 (2026-10-15)

用户截图显示选择“默认类型”后返回“服务器异常”。复核 [GitHub CommentApi](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/CommentApi.kt) 和调用链后发现, 参考项目直接传递列表中的中文标签, 不能作为平台实际编码的保证。

继续核对[官方评论页面脚本](https://mcdev.webapp.163.com/static/js/88.4c6bf4fce431c65a92a6.js), 评论类型选项分别为默认类型 `0`、问题求助 `10`、模组评测 `20`、玩法攻略 `30`、建议反馈 `40`、其他讨论 `50`、组件冲突 `60`; 日期选择器的 `valueFormat` 为 `yyyyMMdd`。[官方表单实现](https://mcdev.webapp.163.com/static/js/app.36b2000c7355e8b0e652.js) 将多个类型编码以 `__` 连接, 单选只传对应编码。本项目当前保留单选类型筛选。

本次操作: 修改合同与 SDK 中的类型编码定义, 修正适配器日期序列化, 替换 UI 类型选项, 新增带卸载保护的评论查询 hook, 保留同查询刷新时的旧数据, 更新离线 fixture 与回归测试。没有发送评论回复或更改平台数据。

验证: 9 项回归测试通过; 浏览器确认默认类型发出 `tag: "0"`, 问题求助发出 `tag: "10"`, 同查询刷新失败保留列表和详情, 新筛选失败清空旧结果并保留面板, 恢复请求后可正常显示。此次未执行真实账号请求, 需要重启桌面程序加载主进程的日期序列化改动。

## 回复接入操作记录 (2026-10-15)

1. 新增回复合同、长度校验、RPC 能力和主进程账号检查, 注册 `replyComment` 网易适配器
2. 读取官方回复字段, 在详情展示已回复内容; 新增 `useCommentReplies.ts` 与 `CommentReplyForm.tsx`, 替换未接入提示
3. 扩展离线预览以模拟回复成功、拒绝、慢请求和已有回复; 评论测试共 13 项, 含请求方法/正文、长度/ID/账号校验、空成功响应、失败与跳转不重试、已有回复解析
4. 浏览器验证失败保留草稿、评论间草稿隔离、双击只发出一次请求、成功展示、已有回复禁用、发送途中切换账号后的状态隔离

测试没有向真实玩家发送回复。桌面程序需重启以注册新增 RPC。

## 当前账号回复判断修复 (2026-10-16)

1. 修改评论适配器, 移除 `commented_num` 对已回复状态的影响; 沿用官方页面以当前会话响应的 `developer_reply` 判断回复状态的语义
2. 评论详情标题改为“当前账号的回复”, 底部状态改为“当前账号已回复”; 回复数组存在但缺少文字时提示平台未返回内容, 不展示其他计数推导出的回复
3. 增加讨论计数、回复文字缺失、不同账号会话返回同一评论的隔离回归; 22 项评论测试通过, 修改文件的 Biome 检查通过
4. 全仓类型检查中评论插件与网易适配器通过; 桌面端仍因作品 RPC 缺少 `works.discardImage/prepareImage/searchReferences/uploadCroppedImage` 处理器而失败, 与本次修改无关

操作仅修改以上源代码、回归测试和本文档, 并运行测试构建与定向格式化; 未请求真实账号数据或发送玩家回复。需重启桌面程序加载主进程适配器修改。

## 刷新性能优化 (2026-10-15)

新增 `comment-cache.ts`, 调整 `useComments.ts` 与评论页面的数据加载位置, 在账号页面内共享缓存并向刷新按钮提供加载状态。用 `useMemo` 和列表组件 memo 减少草稿输入触发的重复计算。更新离线 fixture, 开启 StrictMode 并显示列表请求计数。

19 项评论测试包含 6 项缓存回归: 并发请求合并、30 秒过期、显式刷新、回复后旧请求失效、失败保留数据与重试、账号隔离与容量淘汰。浏览器离线检查: 首次加载 1 次请求, 第 1 页到第 2 页再返回第 1 页总计 2 次请求; 随后慢速模式双击刷新总计 3 次, 刷新期间原列表和详情保留。以上验证的是客户端请求和显示行为, 不表示网易服务器自身的响应时间缩短。

## 评分筛选分页修复 (2026-10-16)

1. 新增 `comment-query.ts`, 在选择评分时汇总服务端分页、按 ID 去重、筛选评分后分页; 未选择评分继续只请求目标页。汇总复用有效的原始分页缓存, 不同评分和页码共享完整快照
2. 修改 `useComments.ts` 与 `CommentsPage.tsx`, 将评分纳入查询标识, 切换评分返回第一页, 总数和页数按匹配评论计算, 更新加载与筛选提示
3. 汇总中任一页失败都返回错误, 不将部分结果当成全部结果; 切换账号或服务端筛选条件隔离快照, 刷新与回复成功沿用原有缓存失效机制
4. 扩展 `tests/comments.test.ts` 与离线 fixture, 新增 `tools/test-comments-ui.mjs`; 30 条评论中只有第 1 和第 22 条满足评分的场景, 验证两条在同一页且没有分页栏

验证: 27 项评论回归测试、评论插件类型检查通过; Edge 无头浏览器通过评分汇总、28 条匹配结果翻页与跳转、多选、类型组合筛选、空结果与账号切换检查。测试只使用离线数据, 未发送真实平台请求。

## 评分分批显示优化 (2026-10-17)

1. 修改 `comment-cache.ts` 和 `comment-query.ts`, 共享进行中的来源扫描并向订阅者推送每批结果, 优先展示已有第一页缓存中的匹配评论; 请求批量由 20 提高到最多 100, 按实际返回条数推进偏移, 避免平台限制批量时漏读
2. 修改 `useComments.ts` 和 `CommentsPage.tsx`, 区分部分结果与最终总数, 显示扫描进度并保持列表可操作; 同查询刷新保留完整旧列表和选中详情, 后续批次失败保留已经展示的匹配结果; 离开查询时取消订阅并停止后续批次
3. 扩展评论回归、离线 fixture 和浏览器检查, 覆盖慢批次之前的匹配结果显示、订阅重放、切换评分共享扫描、部分失败重试、刷新详情保留、账号隔离及失效扫描停止

验证: 31 项评论回归测试、评论插件类型检查、定向 Biome 检查与 `git diff --check` 通过; Edge 无头浏览器通过上述界面场景。仅使用离线测试数据, 未请求真实网易账号或发送玩家回复。
