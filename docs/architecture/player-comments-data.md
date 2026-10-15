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
- 评分只筛选当前页, 不伪造平台不支持的 `stars` 参数; 即使当前页无匹配结果仍可翻页
- 评论类型使用官方页面的固定选项, 即使当前页未加载某种类型也可筛选
- 切换账号会重建页面状态; 改变查询条件会重建结果面板, 不显示上一查询的列表或详情
- 加载、错误重试、空列表、未登录均有独立提示; 总数缩小时回到有效页
- 同一查询刷新失败时保留上次成功的列表和详情, 明确标注结果未刷新; 新筛选失败不会显示旧筛选的结果, 双栏布局仍保留
- 保留现有双栏固定高度和主题样式

## 回复链路

`CommentReplyForm → comments.reply RPC → SessionManager.request → replyComment → PUT /items/comment/pe/{id}/reply`。

- 参考 [GitHub CommentApi](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/CommentApi.kt) 和 [ReplyDTO](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/feedback/ReplyDTO.kt), 使用 PUT, JSON body 只有 `content`
- 官方评论页面对回复限制为 100 字; UI 与主进程合同均检查空白及长度, 请求正文去除首尾空白
- `comments.reply` 使用 `netease:community.write`, 仅主界面调用, 不向 MCP 暴露
- 主进程检查请求账号仍是当前账号, Cookie 仍只在主进程使用; 评论 ID 只允许安全的不透明标识符
- 回复框固定在详情底部; 草稿和发送结果以评论 ID 保存在当前账号页面内, 翻页和筛选保留, 切换账号清空
- 请求期间禁止重复发送, 成功后才清空原评论草稿、展示回复并刷新列表; 失败保留草稿, 网络结果不确定时提示先刷新核实, 不自动重试写请求
- 官方列表的 `developer_reply[0].comment` 用于展示已有回复, `commented_num > 0` 或非空回复数组用于禁用已回复评论的发送框; 缺少时间时不编造回复时间
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
