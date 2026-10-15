# 收益管理

## 范围与来源

`glaze.income/income` 提供手机版 PE / 电脑版 PC 月度收益查询、月份与状态筛选、本地分页和按需加载的单笔详情。本轮只读，不包含申请结算。页面不展示顶部四张汇总卡片。

接口与字段参考 MCDevManager：

- [IncomeApi.kt](https://github.com/BitterLemonn/MCDevManager/blob/mp-master/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/IncomeApi.kt)
- [IncomeDetailVO.kt](https://github.com/BitterLemonn/MCDevManager/blob/mp-master/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/vo/netease/income/IncomeDetailVO.kt)
- [ApplyIncomeDetailVO.kt](https://github.com/BitterLemonn/MCDevManager/blob/mp-master/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/vo/netease/income/ApplyIncomeDetailVO.kt)

| 能力 | 请求 | 用途 |
| --- | --- | --- |
| `income.list` | `GET /incomes?platform=pe或pc&start=0&span=2147483647` | 全部月度记录与平台汇总 |
| `income.detail` | `GET /incomes/{id}` | 单笔收益、费用、激励与可结算月份 |

两项能力通过主进程 `SessionManager.request` 复用会话、凭据更新和错误处理，权限均为 `netease:income.read`。能力元数据允许后续 MCP 使用同一实现。

## 数据语义

- 金额单位为人民币元。金额字符串按十进制校验，汇总以整数分计算；缺失金额保持 `null`，界面显示“—”。列表数量不完整、重复 ID、平台不一致或无效金额均报错，不返回假零值。
- `netYuan` = `income` − `tax` − `tech_service_fee` − `total_usage_price`。任一组成项缺失时，扣费后金额不可用。
- `income` 是平台月度收益；激励、游玩计划、广告与调整金额作为详情分项展示，不再次叠加。
- `available_income` 可能包含多个历史月份，仅作为单笔记录的可结算金额展示，禁止跨记录相加。
- 接口汇总覆盖当前平台全部返回月份，页面不展示该汇总。筛选与每页 12 笔的分页只作用于记录表。
- 未识别的结算状态保留原值。已打款合计仅统计 `pay_success` 记录的扣费后金额；未结算笔数仅统计 `init`。
- 详情显式挑选所需财务字段，不向渲染进程传递银行卡、姓名、通行证等字段，也不在解析错误中回显响应值。
- 账号和平台切换均重新挂载查询状态，迟到请求不会覆盖新账号或新平台。刷新失败时保留同一平台的上次结果并标记失败。
- 详情缓存归属于当前平台页面，最多保留 24 条、一分钟内复用成功结果，并合并同一条记录的在途请求。刷新保留旧值但使缓存失效，旧请求不能覆盖刷新后的缓存；账号、平台或页面切换时销毁缓存。
- 首次展开立即展示列表已有的月度金额和可结算月份，详情专属字段在请求完成后补齐。加载状态不再先缩成一行再撑开；金额格式化复用同一个 `Intl.NumberFormat`。

## 验证与操作记录

2026-10-16：

1. 增加收益契约、只读网易适配器和主进程 RPC，接入能力元数据与插件 SDK 类型。
2. 将收益栏目补为独立工作区插件，注册页面、依赖与清单；离线安装更新工作区链接和锁文件，没有新增第三方依赖。
3. 增加适配器回归测试、离线界面测试入口及验证脚本。
4. 执行类型检查、定向 Biome 检查与桌面生产构建，均通过。
5. `node tools/test-income.mjs`：8 项测试通过，覆盖金额、缺失字段、空列表、重复/不完整数据、未知状态、参数与响应验证、会话及网络错误。
6. `node tools/test-income-ui.mjs [Playwright 模块 URL] [浏览器 channel]`：验证 StrictMode 请求去重、筛选与分页、详情加载、刷新失败/重试、平台切换、迟到响应的账号隔离及两套主题的布局。
7. 当前账号线上只读联调：PE 返回 72 笔、PC 返回 3 笔；PE 最新记录的详情读取成功。重启开发服务刷新新工作区插件缓存后，实际窗口的收益入口、12 行分页和真实详情均正常显示，无错误覆盖层。
8. 按用户截图移除四张顶部汇总卡片，删除专用样式及页面中对应的汇总说明。
9. 收益详情改为紧接所选记录的表格展开行，跨六列显示，不再放在列表末尾。
10. 优化展开体验：增加页面级详情缓存与查询 hook，复用金额格式化器，固定首次加载时的内容结构。补充 3 项缓存回归用例，覆盖请求合并、过期、刷新竞态、错误重试、容量和实例隔离。当前收益测试共 12 项通过；交互测试验证同一条记录再次展开 3 次新增请求为 0，刷新仍发出列表及详情请求，测试数据的加载前后高度差不超过 2px。
11. 实际桌面窗口验证：首次点击至两次动画帧回调约 9ms，重复展开约 8–9ms，首次详情加载前后高度差为 0，无错误覆盖层。这是当前机器的一次渲染观察，不代表网易接口响应耗时或其他机器的性能保证。

线上检查只读取记录，不发起结算，不保存完整财务响应或凭据。离线界面截图为测试数据，位于忽略目录 `node_modules/.cache/income-tests/`。
