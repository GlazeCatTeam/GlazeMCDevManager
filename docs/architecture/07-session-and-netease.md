# 07 会话与网易接入

`@glaze/netease` 是唯一和网易平台打交道的包，运行在主进程。网易接口或登录协议变化时，只改这里。

## 账号身份

- 网易开发者接口（`GET /users/me`）不返回开发者 UID，所以账号用**本地 ID**（UUID）标识。
- 新登录按**通行证账号**（官方登录窗口里 `P_INFO` Cookie 的第一段，例如 `dev@163.com`）归到已有账号；Cookie 导入拿不到通行证账号，按昵称归并。
- 一个账号的数据：本地 ID、昵称、头像地址、通行证账号（可选）、登录方式（官方窗口 / Cookie）、最近登录时间、会话状态、加密的会话 Cookie。**不保存密码**（[ADR-0009](../adr/0009-official-login-window.md)）。

## 会话管理（SessionManager）

### 状态机

```mermaid
stateDiagram-v2
    [*] --> 无会话
    无会话 --> 恢复中: 启动时有最近账号
    恢复中 --> 活跃: 验证通过
    恢复中 --> 已过期: 返回未登录
    恢复中 --> 活跃离线: 网络错误
    活跃离线 --> 活跃: 网络恢复后验证通过
    无会话 --> 登录中: 用户登录
    已过期 --> 登录中: 重新登录
    登录中 --> 活跃: 成功
    登录中 --> 无会话: 失败
    活跃 --> 切换中: 用户切换账号
    切换中 --> 活跃: 目标账号验证通过
    切换中 --> 活跃: 失败，回滚到原账号
    活跃 --> 已过期: 任一请求返回未登录
    活跃 --> 无会话: 退出登录
```

### 关键规则

1. **每个账号一个独立的 CookieJar**。请求时只附加当前账号的 Cookie，并且只发往网易域名白名单。
2. **切换账号串行化**：同一时间只有一个切换在进行（互斥锁）。先验证目标账号，成功后才替换当前会话；失败时保持原账号不变。
3. **会话代次（generation）**：每次切换账号，代次加一。每个请求记录发起时的代次，响应返回时代次不一致就丢弃，防止旧账号的响应写进新账号的界面。
4. **区分过期与网络错误**：只有网易明确返回未登录（401 / `no_login`）才判定过期。超时、断网不改变会话状态，只提示离线。
5. **会话回写**：响应里更新的 Cookie 写回该账号的 CookieJar，并在一定间隔或退出时加密持久化。
6. 会话变化通过事件 `account.switched`、`account.expired`、`account.loggedOut` 推送给 Shell 和插件。

## 登录协议

### 会话偏好

- `sessionSettings.get/set` 读写 `settings` 表的应用级 `sessionSettings` 项，字段为 `autoLogin`、`notifyOnExpire`，首次安装均为 `true`。严格校验两个布尔值，保存成功后广播 `sessionSettings.changed`；卡片确认保存成功才更新开关，失败保留原值并支持重新读取。
- `autoLogin` 只在主进程创建 `SessionManager` 时生效。关闭后该次启动的 `account.current` 为 null、列表不标当前账号、初始路由为登录页且 `restore()` 不读取凭据或请求平台。已保存账号与加密会话不删除，用户可从登录页的“选择已保存账号”进入账号管理并手动验证切换。运行中修改开关不退出当前账号；重新开启也不立即触发登录。
- `notifyOnExpire` 在检测到当前账号由非过期变为过期时读取最新值；开启时发送 Electron 原生系统通知，点击恢复主窗口。并发响应按数据库最新状态去重；延迟的网络错误不能把已过期改回离线。其他账号过期、网络/解析/业务错误和主动退出不弹通知。重新验证或登录成功后，下次过期可再次提醒。
- 关闭提醒仍保留真实状态广播、侧边栏状态与受保护页面的重登引导。过期是在启动验证或业务请求中检测，不新增后台定时轮询。通知失败只记录不含账号信息的警告日志，不阻断状态更新。
- Windows 设置应用标识；原生通知的 `show/click/failed` 处理依据 [Electron Notification](https://www.electronjs.org/docs/latest/api/notification)。安装包须保持 AppUserModelID 与快捷方式身份一致，详见 [Windows 通知说明](https://www.electronjs.org/docs/latest/tutorial/notifications#Windows)。

### 登录方式

从原项目迁移（行为参考，代码重写）：

| 登录方式 | 流程 |
|---|---|
| 官方登录窗口 | 打开网易开发者平台登录页（一次性内存会话分区，只允许网易域名）→ 用户在网易页面登录 → 监听到 `NTES_SESS` 后读取 `P_INFO` → 关闭窗口并清空分区 → `GET /users/me` 验证 → 保存 |
| Cookie 导入 | 从粘贴的内容取出 `NTES_SESS`（整串或只有值）→ `GET /users/me` 验证 → 通过才保存 |

- 不复刻网易的邮箱密码协议，应用不经手密码，见 [ADR-0009](../adr/0009-official-login-window.md)。
- 进度通过 `login.progress` 事件推送，登录界面展示"在网易登录窗口中完成登录 / 验证账号"。
- 只发送 `NTES_SESS`；响应里轮换的 `NTES_SESS` 写回该账号的会话。
- 启动时按保存的状态直接打开页面，后台再验证当前账号；网易返回未登录才判定过期，网络错误只标为离线。

## 端点目录

所有网易接口在一处声明，按业务分文件（参考原项目的 Login、Info、Resource、Upload、Analyze、Income、Activity、Promotion、Feedback、Comment、Mailbox 等接口分组）：

```ts
export const worksList = defineEndpoint({
  id: "works.list",
  method: "GET",
  host: "mcDev",
  path: "/...",
  scope: "netease:works.read",
  params: WorksListParams,
  response: WorksListResponse,
});
```

- `id` 是插件调用时用的名字，`scope` 是所需权限，`params` / `response` 是 Zod schema。
- 主机按别名引用（`login`、`mcDev`、`upload`），实际地址集中配置，便于平台迁移时修改。
- 响应结构用宽松模式解析（允许未知字段），但必需字段缺失时视为解析错误，不填默认值。

## 请求管线

```mermaid
flowchart LR
    A["插件调用 endpointId"] --> B["权限代理：检查 scope"]
    B --> C["参数校验"]
    C --> D["附加当前会话 + 代次"]
    D --> E["域名白名单"]
    E --> F["发送（超时、限流）"]
    F --> G["解析与业务状态码映射"]
    G --> H["Result 返回"]
```

- 超时默认 15 秒，上传单独配置。
- 读请求可重试（指数退避，最多 2 次）；写请求不自动重试。
- 同一账号对同一端点的并发做限流，避免触发平台风控。
- 日志只记录端点 ID、耗时、结果类型，**不记录 Cookie、密码和完整响应体**。

## 错误模型

```ts
type NeteaseError =
  | { kind: "session_expired" }
  | { kind: "network"; cause: string }
  | { kind: "timeout" }
  | { kind: "business"; code: string; message: string }
  | { kind: "parse"; endpoint: string }
  | { kind: "forbidden"; permission: string };
```

- 所有调用返回 `Result<T, NeteaseError>`，调用方必须处理失败分支。
- 聚合类查询（例如首页收益要查多个作品）返回 `Partial<T>`：成功部分 + 失败列表。界面显示"有 N 项查询失败，结果不完整"并提供重试，**绝不把失败当作零**。

## 已接入的数据能力

主进程通过 `SessionManager.request(account, call)` 发请求：默认当前账号，指定账号时不切换界面；网易返回未登录时把该账号标为过期（界面随即跳到重新登录），网络错误标为离线，下次成功后恢复；响应轮换的 `NTES_SESS` 通过 `NeteaseSession.onRenewed` 加密存回。

| 能力 | 网易接口 | 说明 |
|---|---|---|
| `developer.level` | `GET /new_level/` | 等级、阶、经验区间、升阶任务、本月贡献 |
| `analytics.overview` | `GET /data_analysis/overview/` | 字段缺失视为解析错误，不填零 |
| `income.estimate` | `GET /items/categories/pe/`、`/data_analysis/day_detail/`、`/goods/pe/summary`、`/goods/pe/{iid}/`、`/data_analysis/goods/day_detail/` | 作品每 20 个一批查询日明细（必须带 `sort`、`order`，否则平台返回"查询日明细数据失败"），跳过前置模组；某批失败时列出这些作品名，不当作零 |
| `rank.list` / `rank.page` | `GET /square/us_rank_list/`、`/square/rank_list/`；手游缺图另查公开 `POST /h5/pe-item/query/search-by-id-list` | 手游与端游的分类编号不同；`rank_change` 是上次名次减本次名次，上次名次缺失或非正数视为新上榜，超过 50 的有效名次正常计算升降。销售榜分页会将 `rank` 从 1 重置，因此用偏移量加行序号得到绝对名次；热搜空字符串显示“（空搜索词）”，不使整榜失败。优先使用榜单原生 `icon_url`；手游其他条目从 `g79apigatewayobt.nie.netease.com` 的公开分享查询批量匹配准确字符串 ID，取 `title_image_url`，不带 Cookie，拒绝重定向，3 秒超时，失败不丢弃榜单。成功图片元数据缓存 30 分钟/最多 500 条；不缓存失败。端游公开元数据接口仍待核实，不能用同名手游图片替代 |
| `works.list` | `GET /items/categories/pe/` | 只含手机版作品；列表没有封面和上线时间。收益速算也复用它（跳过 `pri_type` 为 9 的前置模组） |
| `works.get` | `GET /items/categories/pe/{id}` | 图标取 `channel` 里 `channel_id` 为 5 的图（1000×1000 正方形），`banner_pic` 是横幅图；另有上线、首次上线、定时上架时间；只能查本账号的作品 |
| `works.reviewFeedback` | `GET /items/categories/pe/{id}/feedback` | 反馈可能是 HTML，主进程转成纯文本；没有反馈时返回 null |

首页查询使用插件内存缓存，账号 ID、登录时间和查询参数共同组成键，60 秒内返回首页或切回榜单不重复请求；过期重新校验、手动刷新绕过有效期，均保留当前键的成功结果。榜单/分类首次加载用固定行占位，热搜保留分类栏空间，避免列表移动；悬停或聚焦标签时预取目标榜单并预解码图片。并发调用共享请求，响应只更新自己的键，快速切换和账号变更不会串数据。

排行榜默认显示全部六个标签，标签区支持滚轮/触控板横向移动；旧的更多/排版和查看全部入口已移除。使用 `rank.page` 每批读取 50 条，固定面板内纵向滚动到末尾自动续读，避免一次拉取端游数万条记录。首批缓存，后续批次每次仅一个请求；失败保留已加载条目并允许重试，不循环自动重试；切榜、账号变更、刷新和卸载隔离旧响应。平台 count 可能大于实际可返回条数，短页或空页结束续读；图片只预解码前 8 张，其余随滚动懒加载。

### 账号管理页等级卡片

账号管理页的等级卡片与首页复用 `developer.level`，显式传递当前账号 ID；按账号重建查询组件，旧账号的延迟响应不进入新账号卡片。请求失败显示错误和重试，不显示固定示例；贡献缺失显示“暂无贡献数据”。经验按 `(totalExp - expFloor) / (expCeiling - expFloor)` 显示当前等级内进度，零宽区间不做除法。

阶级称号和贡献等级文案依据 [MCDevManager LevelName.kt](https://github.com/BitterLemonn/MCDevManager/blob/mp-master/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/consts/LevelName.kt) 的映射语义实现（核对日期 2026-10-16）；只参考行为，不复制 Kotlin 实现。未知阶或贡献等级保留原始数字，不套用已知称号；分数保留平台原始字符串，排名非正数显示“未上榜”，并展示接口返回的贡献月份。

## 两个独立的 HTTP 客户端

| 客户端 | 用途 | 会话 |
|---|---|---|
| 网易客户端 | 所有网易接口 | 按账号附加 Cookie，只发往网易域名白名单 |
| 公共客户端 | GitHub 更新检查、插件作者的 `network:<host>` 请求 | **永远不带 Cookie** |

两个客户端不共享 Cookie 存储，从结构上杜绝原项目 Cookie 随更新请求外泄的问题。

## 业务规则

收益速算等本地规则（分成档位、补贴、统计窗口）放在 `netease` 包的纯函数模块中（`packages/netease/src/income/rules.ts`），界面上明确标注"估算"与平台结算记录的区别。边界测试等 Vitest 接入后补上。

当前规则（按参考项目的行为整理，未经网易官方文档核对）：

- 首页收益速算按自然月统计：目标月 1 日至月末，例如 2026-10 为 10 月 1 日到 10 月 31 日，本月与上月使用同一口径。普通作品的钻石扣除退款率，大厅商品按所属作品汇总。
- 100 钻石计 1 元。每个作品先扣 30% 平台技术服务费，开发者基础分成按该作品流水：100 万钻以下 50%，1000 万以下 52.5%，以上 55%。
- 按总流水返还非开发者部分：10 万钻以下 50%，30 万以下 30%，50 万以下 20%，100 万以下 10%，以上 0。
- 单作品激励：10 万 / 50 万 / 100 万 / 300 万 / 500 万钻起分别为 100 / 500 / 1000 / 3000 / 5000 元，每档最多 3 个作品，超出的降一档。总流水 100 万–500 万钻奖励 200 元，500 万–1000 万奖励 1000 元。总流水达到 5000 万钻时不计任何补贴。
- 个税按劳务报酬：800 元以下不扣，4000 元以下扣（收入 − 800）× 20%，以上扣收入 × 80% × 20%。
