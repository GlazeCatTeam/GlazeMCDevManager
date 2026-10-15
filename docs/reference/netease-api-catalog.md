# MCDevManager 调用网易接口清单

本清单覆盖 [BitterLemonn/MCDevManager 的 mp-master](https://github.com/BitterLemonn/MCDevManager/tree/d7ecc75dac449addd0782870b85fc25fc1447bee) 中的网易登录、开发者平台与文件上传调用。核对提交 `d7ecc75dac449addd0782870b85fc25fc1447bee`, 日期 2026-10-15。

**共 68 条固定网易接口声明, 另有 1 类由 token 指定目标地址的上传协议。**固定声明数保留重复声明、筛选变体和未被页面使用的条目; 不是独立服务器路由数。`UploadApi.uploadFile` 与 `uploadBytes` 属于同一协议的两个入口。通用下载当前只用于 GitHub 更新资源, 单列在排除项。

每项同时列出用途、HTTP 方法、源码声明路径、请求参数、返回类型、调用状态和提交固定的源码链接。这里记录客户端实际声明和调用行为; 源码声明不等于网易公开、稳定的服务端契约。

- [请求体全字段](netease-request-bodies.md): 所有 JSON 请求模型及嵌套字段。
- [结构化索引](netease-api-catalog.json): 注解参数、默认值、模型字段、调用链与完整审计备注。

## 主机与公共约定

| 代号 | 基址 | 用途 |
|---|---|---|
| L | `https://dl.reg.163.com/` | 邮箱登录四步协议 |
| D | `https://mc-launcher.webapp.163.com/` | 开发者账号、作品、分析、互动、活动、收益 |
| U | token policy 内 `url` | FP/PFP 文件上传, 按签发地址请求 |
| W | `https://mcdev.webapp.163.com/#/login/` | 官方网页 / 登录参数 `topURL`, 不是 JSON API |

[NetworkLink.kt:6](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/consts/NetworkLink.kt#L6)。上传动态解析见 [UploadApi.kt:24](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/UploadApi.kt#L24)。

D 类请求通过 Cookie 会话, 关键 Cookie 名为 `NTES_SESS`; 不存在从本项目源码推导出的通用 Bearer token。普通 JSON API 使用 `Content-Type: application/json`; 上传使用 multipart。原项目的 `SessionCookieStorage` 与 `CookiesStore` 共用会话存储, 其行为不构成任意域名转发 Cookie 的授权。

D 类通用响应为 `ResponseData<T>`: `status`, `data`, `msg`, `errors`。原项目接受 `200` / `201` / `ok` / `OK` / `Ok` 为成功, `401` 或 `no_login` 为未登录; 邮箱登录则使用独立的 `ret` 状态, 以 200/201 为成功。`NoNeedData` 和 `Unit` 不表示响应一定没有 body, 只是客户端不需要 data 的业务载荷。

[ResponseData.kt:18](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/common/ResponseData.kt#L18)；[UnifiedExceptionHandler.kt:62](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/utils/UnifiedExceptionHandler.kt#L62)。

表中 `name: Type = default` 是客户端声明的参数默认值, 未写 `= ...` 表示调用该方法时需要提供参数。可空 query 默认 `null` 通常不发送; `Int.MAX_VALUE` 为 2147483647。花括号为路径占位符; 参数的 `path` / `query` / `JSON body` 分别表示路径、查询串和请求体。

## 接口分组

| 分组 | 固定接口声明数 |
|---|---:|
| [邮箱登录](#邮箱登录) | 4 |
| [账号首页与排行榜](#账号首页与排行榜) | 10 |
| [作品与基础字典](#作品与基础字典) | 17 |
| [数据分析与实时收益](#数据分析与实时收益) | 8 |
| [收益与结算](#收益与结算) | 4 |
| [作品活动与折扣](#作品活动与折扣) | 9 |
| [轮播推广申请](#轮播推广申请) | 4 |
| [玩家反馈与开发者反馈](#玩家反馈与开发者反馈) | 3 |
| [玩家评论](#玩家评论) | 2 |
| [消息中心](#消息中心) | 5 |
| [活动红点](#活动红点) | 1 |
| [文件上传 token](#文件上传 token) | 1 |
| 合计 | 68 |

## 邮箱登录

以下使用 L 主机, 外层均为 `EncParamsDTO`。调用顺序为初始化、取得验证参数、本地 VDF 计算、取得 tk、提交登录; VDF 是本地运算, 不是额外 HTTP 接口。四次请求的内层 JSON 经 SM4 编码; `LoginDTO.pw` 先做 RSA 加密。算法和协议常量的位置见 [LoginRepositoryImpl.kt:33](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/LoginRepositoryImpl.kt#L33) 与 [ConstantValue.kt:9](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/consts/ConstantValue.kt#L9)。

实际初始化调用 `init("")`, 因而首步 `topURL` 是空字符串; 后续三步使用 W。`pd=x19_developer`, `pkid=kBSLIYY`, `pkht=mcdev.webapp.163.com`, `channel=0` 为该版本的协议参数。

### 01 初始化网易邮箱登录

**POST L** `/dl/zj/mail/ini`

- 方法: `LoginApi.init`; 有业务调用。
- 参数: JSON body [EncParamsDTO](netease-request-bodies.md#encparamsdto)。
- 返回: `CapIdVO`。
- 源码: [LoginApi.kt:16](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/LoginApi.kt#L16)。
- 加密前模型: [GetCapIdDTO](netease-request-bodies.md#getcapiddto)。
- 调用处: [LoginRepositoryImpl.kt:33](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/LoginRepositoryImpl.kt#L33)；[LoginUseCase.kt:36](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/login/LoginUseCase.kt#L36)。完整调用链见 JSON。

### 02 取得安全验证参数

**POST L** `/dl/zj/mail/powGetP`

- 方法: `LoginApi.getPower`; 有业务调用。
- 参数: JSON body [EncParamsDTO](netease-request-bodies.md#encparamsdto)。
- 返回: `PowerVO`。
- 源码: [LoginApi.kt:20](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/LoginApi.kt#L20)。
- 加密前模型: [GetPowerDTO](netease-request-bodies.md#getpowerdto)。
- 调用处: [LoginRepositoryImpl.kt:42](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/LoginRepositoryImpl.kt#L42)；[LoginUseCase.kt:36](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/login/LoginUseCase.kt#L36)。完整调用链见 JSON。

### 03 取得登录票据 tk

**POST L** `/dl/zj/mail/gt`

- 方法: `LoginApi.getTicket`; 有业务调用。
- 参数: JSON body [EncParamsDTO](netease-request-bodies.md#encparamsdto)。
- 返回: `TicketVO`。
- 源码: [LoginApi.kt:24](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/LoginApi.kt#L24)。
- 加密前模型: [TicketDTO](netease-request-bodies.md#ticketdto)。
- 调用处: [LoginRepositoryImpl.kt:54](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/LoginRepositoryImpl.kt#L54)；[LoginUseCase.kt:36](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/login/LoginUseCase.kt#L36)。完整调用链见 JSON。

### 04 提交加密密码、票据和安全验证结果

**POST L** `/dl/zj/mail/l`

- 方法: `LoginApi.safeLogin`; 有业务调用。
- 参数: JSON body [EncParamsDTO](netease-request-bodies.md#encparamsdto)。
- 返回: `BaseLoginVO`。
- 源码: [LoginApi.kt:28](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/LoginApi.kt#L28)。
- 加密前模型: [LoginDTO](netease-request-bodies.md#logindto)。
- 调用处: [LoginRepositoryImpl.kt:65](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/LoginRepositoryImpl.kt#L65)；[LoginUseCase.kt:36](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/login/LoginUseCase.kt#L36)。完整调用链见 JSON。

## 账号首页与排行榜

### 05 开发者资料、收益摘要、Cookie 验证和账号恢复

**GET D** `/users/me`

- 方法: `InfoApi.getUserInfo`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<UserInfoVO>`。
- 源码: [InfoApi.kt:19](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L19)。
- 调用处: [UserRepositoryImpl.kt:19](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/UserRepositoryImpl.kt#L19)；[IncomeRepositoryImpl.kt:39](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/IncomeRepositoryImpl.kt#L39)；[MainUseCase.kt:76](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/main/MainUseCase.kt#L76)。完整调用链见 JSON。

### 06 首页昨日/14日/当月/上月下载和钻石概览

**GET D** `/data_analysis/overview`

- 方法: `InfoApi.getOverview`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<OverviewVO>`。
- 源码: [InfoApi.kt:22](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L22)。
- 调用处: [UserRepositoryImpl.kt:25](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/UserRepositoryImpl.kt#L25)；[MainUseCase.kt:77](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/main/MainUseCase.kt#L77)；[MainViewModel.kt:195](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/main/MainViewModel.kt#L195)。完整调用链见 JSON。

### 07 等级与贡献排名；首页、账号页

**GET D** `/new_level`

- 方法: `InfoApi.getLevelInfo`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<LevelInfoVO>`。
- 源码: [InfoApi.kt:25](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L25)。
- 调用处: [UserRepositoryImpl.kt:31](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/UserRepositoryImpl.kt#L31)；[MainUseCase.kt:78](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/main/MainUseCase.kt#L78)；[GetLevelInfoUseCase.kt:9](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/user/GetLevelInfoUseCase.kt#L9)。完整调用链见 JSON。

### 08 资源列表；此 InfoApi 方法未被任何代码调用

**GET D** `/items/categories/{platform}`

- 方法: `InfoApi.getResInfoList`; 仅声明。
- 参数: path `platform: String = "pe"`; query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`。
- 返回: `ResponseData<ResourceListVO>`。
- 源码: [InfoApi.kt:28](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L28)。

### 09 手游热门飙升榜

**GET D** `/square/us_rank_list/?type=pe_hot`

- 方法: `InfoApi.getPeHotRankList`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = 50`; query `first_type: Int`。
- 返回: `ResponseData<RankListVO<PeHotData>>`。
- 源码: [InfoApi.kt:35](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L35)。
- 调用处: [RankListRepositoryImpl.kt:20](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/RankListRepositoryImpl.kt#L20)；[RankListUseCase.kt:26](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/rankList/RankListUseCase.kt#L26)；[MainViewModel.kt:318](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/main/MainViewModel.kt#L318)。完整调用链见 JSON。

### 10 热搜榜

**GET D** `/square/us_rank_list/?type=hot_search`

- 方法: `InfoApi.getHotSearchRankList`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = 50`; query `first_type: Int`。
- 返回: `ResponseData<RankListVO<HotSearchData>>`。
- 源码: [InfoApi.kt:42](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L42)。
- 调用处: [RankListRepositoryImpl.kt:26](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/RankListRepositoryImpl.kt#L26)；[RankListUseCase.kt:34](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/rankList/RankListUseCase.kt#L34)；[MainViewModel.kt:318](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/main/MainViewModel.kt#L318)。完整调用链见 JSON。

### 11 手游免费榜

**GET D** `/square/rank_list/?type=pe_download`

- 方法: `InfoApi.getPeDownloadRankList`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = 50`; query `first_type: Int`。
- 返回: `ResponseData<RankListVO<CommonRankListData>>`。
- 源码: [InfoApi.kt:49](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L49)。
- 调用处: [RankListRepositoryImpl.kt:32](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/RankListRepositoryImpl.kt#L32)；[RankListUseCase.kt:42](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/rankList/RankListUseCase.kt#L42)；[MainViewModel.kt:318](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/main/MainViewModel.kt#L318)。完整调用链见 JSON。

### 12 手游付费榜

**GET D** `/square/rank_list/?type=pe_sell`

- 方法: `InfoApi.getPeSellRankList`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = 50`; query `first_type: Int`。
- 返回: `ResponseData<RankListVO<CommonRankListData>>`。
- 源码: [InfoApi.kt:56](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L56)。
- 调用处: [RankListRepositoryImpl.kt:38](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/RankListRepositoryImpl.kt#L38)；[RankListUseCase.kt:46](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/rankList/RankListUseCase.kt#L46)；[MainViewModel.kt:318](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/main/MainViewModel.kt#L318)。完整调用链见 JSON。

### 13 端游免费榜

**GET D** `/square/rank_list/?type=pc_download`

- 方法: `InfoApi.getPcDownloadRankList`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = 50`; query `first_type: Int`。
- 返回: `ResponseData<RankListVO<CommonRankListData>>`。
- 源码: [InfoApi.kt:63](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L63)。
- 调用处: [RankListRepositoryImpl.kt:44](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/RankListRepositoryImpl.kt#L44)；[RankListUseCase.kt:50](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/rankList/RankListUseCase.kt#L50)；[MainViewModel.kt:318](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/main/MainViewModel.kt#L318)。完整调用链见 JSON。

### 14 端游喜爱榜

**GET D** `/square/rank_list/?type=pc_like`

- 方法: `InfoApi.getPcLikeRankList`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = 50`; query `first_type: Int`。
- 返回: `ResponseData<RankListVO<CommonRankListData>>`。
- 源码: [InfoApi.kt:70](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/InfoApi.kt#L70)。
- 调用处: [RankListRepositoryImpl.kt:50](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/RankListRepositoryImpl.kt#L50)；[RankListUseCase.kt:54](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/rankList/RankListUseCase.kt#L54)；[MainViewModel.kt:318](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/main/MainViewModel.kt#L318)。完整调用链见 JSON。

## 作品与基础字典

### 15 作品列表/名称搜索；首页与收益分析也复用该列表

**GET D** `/items/categories/{platform}`

- 方法: `ResourceApi.getAllResource`; 有业务调用。
- 参数: path `platform: String = "pe"`; query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`; query `item_name: String? = null`; query `mc_status: Int? = null`。
- 返回: `ResponseData<ResourceListVO>`。
- 源码: [ResourceApi.kt:29](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L29)。
- 调用处: [ResourceRepositoryImpl.kt:37](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L37)；[GetResourceListUseCase.kt:20](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/resource/GetResourceListUseCase.kt#L20)；[WorkDetailViewModel.kt:519](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L519)。完整调用链见 JSON。

### 16 PC 前置模组名称搜索，query_str

**GET D** `/items/categories/comp/requirements`

- 方法: `ResourceApi.getRequirements`; 有业务调用。
- 参数: query `query_str: String`。
- 返回: `ResponseData<RequirementVO>`。
- 源码: [ResourceApi.kt:38](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L38)。
- 调用处: [ResourceRepositoryImpl.kt:45](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L45)；[WorkDetailUseCase.kt:50](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkDetailUseCase.kt#L50)；[WorkDetailViewModel.kt:596](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L596)。完整调用链见 JSON。

### 17 PE 前置模组搜索，通过 PE 列表 pri_type=9 筛选

**GET D** `/items/categories/pe/`

- 方法: `ResourceApi.getPePrerequisites`; 有业务调用。
- 参数: query `pri_type: Int`; query `item_name: String`; query `start: Int = 0`; query `span: Int = 20`。
- 返回: `ResponseData<RequirementVO>`。
- 源码: [ResourceApi.kt:45](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L45)。
- 调用处: [ResourceRepositoryImpl.kt:49](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L49)；[WorkDetailUseCase.kt:57](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkDetailUseCase.kt#L57)；[WorkDetailViewModel.kt:573](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L573)。完整调用链见 JSON。

### 18 读取 PE 作品详情和编辑表单原始数据

**GET D** `/items/categories/pe/{itemId}`

- 方法: `ResourceApi.getResourceDetail`; 有业务调用。
- 参数: path `itemId: String`。
- 返回: `ResponseData<ResourceDetailVO>`。
- 源码: [ResourceApi.kt:53](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L53)。
- 调用处: [ResourceRepositoryImpl.kt:53](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L53)；[WorkDetailUseCase.kt:24](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkDetailUseCase.kt#L24)；[WorkDetailViewModel.kt:299](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L299)。完整调用链见 JSON。

### 19 删除作品

**DELETE D** `/items/categories/pe/{itemId}`

- 方法: `ResourceApi.deleteItem`; 有业务调用。
- 参数: path `itemId: String`。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:56](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L56)。
- 调用处: [ResourceRepositoryImpl.kt:56](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L56)；[WorkManageUseCase.kt:112](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L112)；[WorkManageViewModel.kt:102](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workmanage/WorkManageViewModel.kt#L102)。完整调用链见 JSON。

### 20 保存作品编辑、资源包替换；另有 is_check_apply 标志

**POST D** `/items/categories/pe/{itemId}/update`

- 方法: `ResourceApi.updateItem`; 有业务调用。
- 参数: path `itemId: String`; JSON body [WorkUpdateDTO](netease-request-bodies.md#workupdatedto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:59](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L59)。
- 调用处: [ResourceRepositoryImpl.kt:67](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L67)；[WorkDetailUseCase.kt:92](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkDetailUseCase.kt#L92)；[WorkDetailViewModel.kt:891](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L891)。完整调用链见 JSON。

### 21 新建 PE 作品，以上传回执填充 res/channel

**POST D** `/items/categories/pe/upload`

- 方法: `ResourceApi.createItem`; 有业务调用。
- 参数: JSON body [WorkCreateDTO](netease-request-bodies.md#workcreatedto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:65](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L65)。
- 调用处: [ResourceRepositoryImpl.kt:70](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L70)；[WorkDetailUseCase.kt:105](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkDetailUseCase.kt#L105)；[WorkDetailViewModel.kt:1124](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L1124)。完整调用链见 JSON。

### 22 提交审核/校验；作品列表和作品编辑均有调用

**PUT D** `/items/categories/pe/{itemId}/apply_review`

- 方法: `ResourceApi.applyReview`; 有业务调用。
- 参数: path `itemId: String`; JSON body [ApplyReviewDTO](netease-request-bodies.md#applyreviewdto)。
- 返回: `ResponseData<ReviewApplyResultVO>`。
- 源码: [ResourceApi.kt:68](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L68)。
- 调用处: [ResourceRepositoryImpl.kt:76](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L76)；[WorkManageUseCase.kt:42](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L42)；[WorkDetailUseCase.kt:100](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkDetailUseCase.kt#L100)。完整调用链见 JSON。

### 23 撤销审核

**PUT D** `/items/categories/pe/{itemId}/cancel_review`

- 方法: `ResourceApi.cancelReview`; 有业务调用。
- 参数: path `itemId: String`。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:74](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L74)。
- 调用处: [ResourceRepositoryImpl.kt:79](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L79)；[WorkManageUseCase.kt:52](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L52)；[WorkManageViewModel.kt:99](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workmanage/WorkManageViewModel.kt#L99)。完整调用链见 JSON。

### 24 申请自测，self_test_pass_check 控制免机审

**PUT D** `/items/categories/pe/{itemId}/self-test-apply`

- 方法: `ResourceApi.applySelfTest`; 有业务调用。
- 参数: path `itemId: String`; JSON body [ApplySelfTestDTO](netease-request-bodies.md#applyselftestdto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:77](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L77)。
- 调用处: [ResourceRepositoryImpl.kt:88](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L88)；[WorkManageUseCase.kt:91](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L91)；[WorkManageViewModel.kt:134](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workmanage/WorkManageViewModel.kt#L134)。完整调用链见 JSON。

### 25 取消自测

**PUT D** `/items/categories/pe/{itemId}/cancel_self_test`

- 方法: `ResourceApi.cancelSelfTest`; 有业务调用。
- 参数: path `itemId: String`。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:83](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L83)。
- 调用处: [ResourceRepositoryImpl.kt:91](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L91)；[WorkManageUseCase.kt:98](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L98)；[WorkManageViewModel.kt:100](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workmanage/WorkManageViewModel.kt#L100)。完整调用链见 JSON。

### 26 读取审核反馈

**GET D** `/items/categories/pe/{itemId}/feedback`

- 方法: `ResourceApi.getReviewFeedback`; 有业务调用。
- 参数: path `itemId: String`。
- 返回: `ResponseData<ReviewFeedbackVO>`。
- 源码: [ResourceApi.kt:86](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L86)。
- 调用处: [ResourceRepositoryImpl.kt:82](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L82)；[WorkManageUseCase.kt:59](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L59)；[WorkManageViewModel.kt:192](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workmanage/WorkManageViewModel.kt#L192)。完整调用链见 JSON。

### 27 立即上架；默认 op_platform=all

**PUT D** `/items/categories/pe/{itemId}/online`

- 方法: `ResourceApi.onlineItem`; 有业务调用。
- 参数: path `itemId: String`; JSON body [OnlineItemDTO](netease-request-bodies.md#onlineitemdto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:89](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L89)。
- 调用处: [ResourceRepositoryImpl.kt:103](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L103)；[WorkManageUseCase.kt:69](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L69)；[WorkManageViewModel.kt:101](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workmanage/WorkManageViewModel.kt#L101)。完整调用链见 JSON。

### 28 设置/取消定时上架；时间格式 YYYY-MM-DD HH:mm:ss

**PUT D** `/items/categories/pe/{itemId}/appoint_online`

- 方法: `ResourceApi.appointOnlineItem`; 有业务调用。
- 参数: path `itemId: String`; JSON body [AppointOnlineDTO](netease-request-bodies.md#appointonlinedto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:95](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L95)。
- 调用处: [ResourceRepositoryImpl.kt:109](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L109)；[WorkManageUseCase.kt:80](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L80)；[WorkManageViewModel.kt:163](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workmanage/WorkManageViewModel.kt#L163)。完整调用链见 JSON。

### 29 修改作品价格

**POST D** `/items/categories/pe/{itemId}/change_price`

- 方法: `ResourceApi.changePrice`; 有业务调用。
- 参数: path `itemId: String`; JSON body [ChangePriceDTO](netease-request-bodies.md#changepricedto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ResourceApi.kt:101](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L101)。
- 调用处: [ResourceRepositoryImpl.kt:97](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L97)；[WorkManageUseCase.kt:105](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkManageUseCase.kt#L105)；[WorkManageViewModel.kt:249](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workmanage/WorkManageViewModel.kt#L249)。完整调用链见 JSON。

### 30 读取作品标签配置

**GET D** `/item-tag`

- 方法: `ResourceApi.getItemTag`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<ItemTagVO>`。
- 源码: [ResourceApi.kt:107](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L107)。
- 调用处: [ResourceRepositoryImpl.kt:59](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L59)；[WorkDetailUseCase.kt:28](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkDetailUseCase.kt#L28)；[WorkDetailViewModel.kt:427](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L427)。完整调用链见 JSON。

### 31 读取资源类型、图片位、版本、价格等开平常量；MCConstsCache 缓存

**GET D** `/items/mc_consts`

- 方法: `ResourceApi.getMCConsts`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<MCConstsVO>`。
- 源码: [ResourceApi.kt:110](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ResourceApi.kt#L110)。
- 调用处: [ResourceRepositoryImpl.kt:63](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ResourceRepositoryImpl.kt#L63)；[WorkDetailUseCase.kt:32](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/work/WorkDetailUseCase.kt#L32)；[WorkDetailViewModel.kt:440](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L440)。完整调用链见 JSON。

## 数据分析与实时收益

### 32 普通资源日详情、数据追踪、模组分析、首页收益速算

**GET D** `/data_analysis/day_detail/`

- 方法: `AnalyzeApi.getDayDetail`; 有业务调用。
- 参数: query `platform: String`; query `category: String`; query `start_date: String`; query `end_date: String`; query `item_list_str: String`; query `sort: String = "dateid"`; query `order: String = "ASC"`; query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`; query `is_need_us_rank_data: Boolean = true`。
- 返回: `ResponseData<ResDetailVO>`。
- 源码: [AnalyzeApi.kt:15](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/AnalyzeApi.kt#L15)。
- 调用处: [AnalyzeRepositoryImpl.kt:39](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/AnalyzeRepositoryImpl.kt#L39)；[DayDetailUseCase.kt:47](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/DayDetailUseCase.kt#L47)；[ModAnalysisUseCase.kt:45](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/ModAnalysisUseCase.kt#L45)。完整调用链见 JSON。

### 33 联机大厅商品日详情、首页大厅作品收益聚合

**GET D** `/data_analysis/goods/day_detail/`

- 方法: `AnalyzeApi.getLobbyDayDetail`; 有业务调用。
- 参数: query `platform: String = "pe"`; query `category: String = "pe"`; query `start_date: String`; query `end_date: String`; query `item_list_str: String`; query `sort: String = "dateid"`; query `order: String = "ASC"`; query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`; query `is_need_us_rank_data: Boolean = false`; query `mc_type: String = "1"`。
- 返回: `ResponseData<ResDetailVO>`。
- 源码: [AnalyzeApi.kt:29](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/AnalyzeApi.kt#L29)。
- 调用处: [AnalyzeRepositoryImpl.kt:33](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/AnalyzeRepositoryImpl.kt#L33)；[DayDetailUseCase.kt:47](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/DayDetailUseCase.kt#L47)；[MainUseCase.kt:167](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/main/MainUseCase.kt#L167)。完整调用链见 JSON。

### 34 普通资源月度汇总

**GET D** `/data_analysis/month_detail/`

- 方法: `AnalyzeApi.getMonthDetail`; 有业务调用。
- 参数: query `platform: String`; query `category: String`; query `start_date: String`; query `end_date: String`; query `sort: String = "monthid"`; query `order: String = "DESC"`; query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`; query `day_sort: String = "cnt_buy"`; query `day_span: Int = Int.MAX_VALUE`; query `day_dateid: String`。
- 返回: `ResponseData<ResMonthDetailVO>`。
- 源码: [AnalyzeApi.kt:44](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/AnalyzeApi.kt#L44)。
- 调用处: [AnalyzeRepositoryImpl.kt:66](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/AnalyzeRepositoryImpl.kt#L66)；[MonthDetailUseCase.kt:43](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/MonthDetailUseCase.kt#L43)；[MonthDetailViewModel.kt:85](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/analyze/monthDetail/MonthDetailViewModel.kt#L85)。完整调用链见 JSON。

### 35 联机大厅商品月度汇总

**GET D** `/data_analysis/goods/month_detail/`

- 方法: `AnalyzeApi.getLobbyMonthDetail`; 有业务调用。
- 参数: query `platform: String = "pe"`; query `category: String = "pe"`; query `start_date: String`; query `end_date: String`; query `sort: String = "monthid"`; query `order: String = "DESC"`; query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`; query `day_sort: String = "cnt_buy"`; query `day_span: Int = Int.MAX_VALUE`; query `day_dateid: String`; query `mc_type: String = "1"`。
- 返回: `ResponseData<ResMonthDetailVO>`。
- 源码: [AnalyzeApi.kt:59](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/AnalyzeApi.kt#L59)。
- 调用处: [AnalyzeRepositoryImpl.kt:60](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/AnalyzeRepositoryImpl.kt#L60)；[MonthDetailUseCase.kt:43](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/MonthDetailUseCase.kt#L43)；[MonthDetailViewModel.kt:85](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/analyze/monthDetail/MonthDetailViewModel.kt#L85)。完整调用链见 JSON。

### 36 逐普通资源实时收益与订单

**GET D** `/items/categories/{platform}/{iid}/incomes/`

- 方法: `AnalyzeApi.getOneResRealtimeIncome`; 有业务调用。
- 参数: path `platform: String`; path `iid: String`; query `begin_time: String`; query `end_time: String`。
- 返回: `ResponseData<OneResRealtimeIncomeVO>`。
- 源码: [AnalyzeApi.kt:75](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/AnalyzeApi.kt#L75)。
- 调用处: [AnalyzeRepositoryImpl.kt:84](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/AnalyzeRepositoryImpl.kt#L84)；[RealtimeProfitUseCase.kt:26](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/RealtimeProfitUseCase.kt#L26)；[RealtimeProfitViewModel.kt:137](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/analyze/realtimeProfit/RealtimeProfitViewModel.kt#L137)。完整调用链见 JSON。

### 37 大厅商业化作品列表；供收益与商品查询展开

**GET D** `/goods/pe/summary`

- 方法: `AnalyzeApi.getLobbyIncomeResources`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`。
- 返回: `ResponseData<LobbyIncomeResourceListVO>`。
- 源码: [AnalyzeApi.kt:83](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/AnalyzeApi.kt#L83)。
- 调用处: [AnalyzeRepositoryImpl.kt:95](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/AnalyzeRepositoryImpl.kt#L95)；[RealtimeProfitUseCase.kt:35](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/RealtimeProfitUseCase.kt#L35)；[LobbyGoodsUseCase.kt:27](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/LobbyGoodsUseCase.kt#L27)。完整调用链见 JSON。

### 38 大厅作品下的全部商品，含未上架/已下架商品

**GET D** `/goods/pe/{iid}/`

- 方法: `AnalyzeApi.getLobbyGoodsList`; 有业务调用。
- 参数: path `iid: String`。
- 返回: `ResponseData<LobbyGoodsListVO>`。
- 源码: [AnalyzeApi.kt:89](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/AnalyzeApi.kt#L89)。
- 调用处: [AnalyzeRepositoryImpl.kt:101](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/AnalyzeRepositoryImpl.kt#L101)；[LobbyGoodsUseCase.kt:35](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/LobbyGoodsUseCase.kt#L35)；[MainUseCase.kt:120](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/main/MainUseCase.kt#L120)。完整调用链见 JSON。

### 39 逐大厅作品实时内购收益；iid 为作品 ID

**GET D** `/items/categories/pe/{iid}/lobby_incomes/`

- 方法: `AnalyzeApi.getLobbyRealtimeIncome`; 有业务调用。
- 参数: path `iid: String`; query `begin_time: String`; query `end_time: String`。
- 返回: `ResponseData<OneResRealtimeIncomeVO>`。
- 源码: [AnalyzeApi.kt:94](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/AnalyzeApi.kt#L94)。
- 调用处: [AnalyzeRepositoryImpl.kt:111](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/AnalyzeRepositoryImpl.kt#L111)；[RealtimeProfitUseCase.kt:41](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/RealtimeProfitUseCase.kt#L41)；[RealtimeProfitViewModel.kt:133](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/analyze/realtimeProfit/RealtimeProfitViewModel.kt#L133)。完整调用链见 JSON。

## 收益与结算

### 40 申请结算；有写入影响

**PUT D** `/incomes/apply`

- 方法: `IncomeApi.applyIncome`; 有业务调用。
- 参数: JSON body [ApplyIncomeDTO](netease-request-bodies.md#applyincomedto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [IncomeApi.kt:19](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/IncomeApi.kt#L19)。
- 调用处: [IncomeRepositoryImpl.kt:31](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/IncomeRepositoryImpl.kt#L31)；[IncomeUseCase.kt:55](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/income/IncomeUseCase.kt#L55)；[IncomeViewModel.kt:80](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/income/IncomeViewModel.kt#L80)。完整调用链见 JSON。

### 41 PE/PC 收益结算记录

**GET D** `/incomes`

- 方法: `IncomeApi.getIncome`; 有业务调用。
- 参数: query `platform: String = "pe"`; query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`。
- 返回: `ResponseData<IncomeDetailVO>`。
- 源码: [IncomeApi.kt:25](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/IncomeApi.kt#L25)。
- 调用处: [IncomeRepositoryImpl.kt:23](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/IncomeRepositoryImpl.kt#L23)；[IncomeUseCase.kt:19](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/income/IncomeUseCase.kt#L19)；[IncomeUseCase.kt:20](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/income/IncomeUseCase.kt#L20)。完整调用链见 JSON。

### 42 结算明细，包括结算账号和银行信息字段

**GET D** `/incomes/{id}`

- 方法: `IncomeApi.getApplyDetail`; 有业务调用。
- 参数: path `id: String`。
- 返回: `ResponseData<ApplyIncomeDetailVO>`。
- 源码: [IncomeApi.kt:33](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/IncomeApi.kt#L33)。
- 调用处: [IncomeRepositoryImpl.kt:27](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/IncomeRepositoryImpl.kt#L27)；[IncomeUseCase.kt:48](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/income/IncomeUseCase.kt#L48)；[IncomeViewModel.kt:64](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/income/IncomeViewModel.kt#L64)。完整调用链见 JSON。

### 43 激励金明细；只有 repository 转发，未接 domain/UI

**GET D** `/incentive_fund/detail`

- 方法: `IncomeApi.getIncentiveFund`; 仅 repository 转发。
- 参数: query `platform: String = "pe"`; query `start: Int = 0`; query `span: Int = Int.MAX_VALUE`。
- 返回: `ResponseData<IncentiveListDTO>`。
- 源码: [IncomeApi.kt:39](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/IncomeApi.kt#L39)。
- 调用处: [IncomeRepositoryImpl.kt:35](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/IncomeRepositoryImpl.kt#L35)。完整调用链见 JSON。

## 作品活动与折扣

### 44 分页获取作品评审活动列表

**GET D** `/activities/pe-review-activities`

- 方法: `ActivityApi.getReviewActivity`; 有业务调用。
- 参数: query `start: Int`; query `span: Int = 10`。
- 返回: `ResponseData<ActivityReviewVO>`。
- 源码: [ActivityApi.kt:27](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L27)。
- 调用约定: UI 每页 span=10，start 为偏移量。
- 调用处: [ActivityRepositoryImpl.kt:26](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L26)；[ActivityUseCase.kt:20](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L20)；[ActivityViewModel.kt:32](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/activity/ActivityViewModel.kt#L32)。完整调用链见 JSON。

### 45 获取活动模块可报名作品列表

**GET D** `/activities/pe-review-activities/{activityId}/modules/{modulesId}/candidates`

- 方法: `ActivityApi.getActivityCandidates`; 有业务调用。
- 参数: path `activityId: String`; path `modulesId: String`。
- 返回: `ResponseData<ActivityCandidatesVO>`。
- 源码: [ActivityApi.kt:36](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L36)。
- 调用约定: Review VO 的 module_id 为 Int，UseCase 在构造 Path 参数前转为 String。
- 调用处: [ActivityRepositoryImpl.kt:35](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L35)；[ActivityUseCase.kt:52](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L52)；[ActivityUseCase.kt:81](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L81)。完整调用链见 JSON。

### 46 获取活动模块已报名作品与审核状态

**GET D** `/activities/pe-review-activities/{activityId}/modules/{modulesId}/items`

- 方法: `ActivityApi.getActivityItems`; 有业务调用。
- 参数: path `activityId: String`; path `modulesId: String`。
- 返回: `ResponseData<ActivityItemsVO>`。
- 源码: [ActivityApi.kt:45](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L45)。
- 调用处: [ActivityRepositoryImpl.kt:44](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L44)；[ActivityUseCase.kt:60](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L60)；[ActivityDetailViewModel.kt:41](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/activity/detail/ActivityDetailViewModel.kt#L41)。完整调用链见 JSON。

### 47 提交作品活动报名

**POST D** `/activities/pe-review-activities/{activityId}/modules/{modulesId}/join`

- 方法: `ActivityApi.joinActivity`; 有业务调用。
- 参数: path `activityId: String`; path `modulesId: String`; JSON body [JoinActivityDTO](netease-request-bodies.md#joinactivitydto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ActivityApi.kt:54](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L54)。
- 调用约定: DTO 的 video_info_list 和 image_list 均默认 []；UI 在 ActivityParticipateViewModel.kt:190-194 填入已准备的 FileInfoDTO 列表。
- 调用处: [ActivityRepositoryImpl.kt:54](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L54)；[ActivityUseCase.kt:93](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L93)；[ActivityParticipateViewModel.kt:187](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/activity/participate/ActivityParticipateViewModel.kt#L187)。完整调用链见 JSON。

### 48 获取当前折扣特卖活动及模块、分区规则

**GET D** `/activities/discount_activities/current`

- 方法: `ActivityApi.getDiscountActivity`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<DiscountActivityVO>`。
- 源码: [ActivityApi.kt:64](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L64)。
- 调用处: [ActivityRepositoryImpl.kt:64](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L64)；[ActivityUseCase.kt:100](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L100)；[DiscountActivityViewModel.kt:34](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/activity/discount/DiscountActivityViewModel.kt#L34)。完整调用链见 JSON。

### 49 获取可参加折扣活动的候选作品

**GET D** `/activities/discount_activities/candidates`

- 方法: `ActivityApi.getDiscountCandidates`; 有业务调用。
- 参数: query `activity_id: String`; query `module_id: String`。
- 返回: `ResponseData<DiscountCandidatesVO>`。
- 源码: [ActivityApi.kt:70](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L70)。
- 调用处: [ActivityRepositoryImpl.kt:73](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L73)；[ActivityUseCase.kt:114](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L114)；[DiscountActivityViewModel.kt:81](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/activity/discount/DiscountActivityViewModel.kt#L81)。完整调用链见 JSON。

### 50 获取当前折扣活动模块已报名作品

**GET D** `/activities/discount_activities/current/modules/{moduleId}/items`

- 方法: `ActivityApi.getDiscountJoinedItems`; 有业务调用。
- 参数: path `moduleId: String`。
- 返回: `ResponseData<DiscountItemsVO>`。
- 源码: [ActivityApi.kt:79](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L79)。
- 调用处: [ActivityRepositoryImpl.kt:79](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L79)；[ActivityUseCase.kt:115](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L115)；[DiscountActivityViewModel.kt:81](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/activity/discount/DiscountActivityViewModel.kt#L81)。完整调用链见 JSON。

### 51 批量报名折扣特卖

**POST D** `/activities/discount_activities/join`

- 方法: `ActivityApi.joinDiscount`; 有业务调用。
- 参数: JSON body [JoinDiscountDTO](netease-request-bodies.md#joindiscountdto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ActivityApi.kt:87](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L87)。
- 调用约定: discount 是 Int 百分比；UI 检查当前活动模块返回的 min_discount..max_discount 范围，不能把折扣表示为 0..1 浮点值。
- 调用处: [ActivityRepositoryImpl.kt:85](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L85)；[ActivityUseCase.kt:147](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L147)；[DiscountActivityViewModel.kt:165](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/activity/discount/DiscountActivityViewModel.kt#L165)。完整调用链见 JSON。

### 52 取消单个作品的折扣特卖报名

**POST D** `/activities/discount_activities/cancel_join`

- 方法: `ActivityApi.cancelDiscountJoin`; 有业务调用。
- 参数: JSON body [CancelJoinDiscountDTO](netease-request-bodies.md#canceljoindiscountdto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [ActivityApi.kt:96](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ActivityApi.kt#L96)。
- 调用处: [ActivityRepositoryImpl.kt:91](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/ActivityRepositoryImpl.kt#L91)；[ActivityUseCase.kt:163](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/activity/ActivityUseCase.kt#L163)；[DiscountActivityViewModel.kt:134](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/activity/discount/DiscountActivityViewModel.kt#L134)。完整调用链见 JSON。

## 轮播推广申请

### 53 查询 PE 轮播图可申请日期和原因

**GET D** `/promotion-banner/pe/can_apply`

- 方法: `PromotionApi.getCanApplyPromotion`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<CanApplyPromotionVO>`。
- 源码: [PromotionApi.kt:20](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/PromotionApi.kt#L20)。
- 调用约定: UseCase 注释描述 permit 的 key 为 Unix 秒日期；DTO 本身使用 Map<String, Boolean>。
- 调用处: [PromotionRepositoryImpl.kt:19](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/PromotionRepositoryImpl.kt#L19)；[PromotionUseCase.kt:15](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/promotion/PromotionUseCase.kt#L15)；[PromotionViewModel.kt:90](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/promotion/PromotionViewModel.kt#L90)。完整调用链见 JSON。

### 54 分页查询用户轮播图申请记录

**GET D** `/promotion-banner/user-applications`

- 方法: `PromotionApi.getUserApply`; 有业务调用。
- 参数: query `start: Int`; query `span: Int = 10`; query `platform: String = "pe"`; query `type: String = "apply"`。
- 返回: `ResponseData<UserApplyVO>`。
- 源码: [PromotionApi.kt:23](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/PromotionApi.kt#L23)。
- 调用处: [PromotionRepositoryImpl.kt:42](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/PromotionRepositoryImpl.kt#L42)；[PromotionUseCase.kt:112](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/promotion/PromotionUseCase.kt#L112)；[PromotionViewModel.kt:119](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/promotion/PromotionViewModel.kt#L119)。完整调用链见 JSON。

### 55 提交 PE 轮播图推广申请

**POST D** `/promotion-banner/apply/`

- 方法: `PromotionApi.applyPromotion`; 有业务调用。
- 参数: JSON body [ApplyPromotionDTO](netease-request-bodies.md#applypromotiondto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [PromotionApi.kt:31](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/PromotionApi.kt#L31)。
- 发包路径: `/promotion-banner/apply/`; 内部 `X-Trailing-Slash` 标记在请求前移除。
- 调用约定: UseCase 构造时固定 position_id="6", item_category="pe", special_promotion=false, start_time_zone=-8, is_check=true；start_time 为 Unix 秒，pe_channel 为上传后的宣传图 URL。
- 调用处: [PromotionRepositoryImpl.kt:23](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/PromotionRepositoryImpl.kt#L23)；[PromotionUseCase.kt:49](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/promotion/PromotionUseCase.kt#L49)；[PromotionViewModel.kt:343](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/promotion/PromotionViewModel.kt#L343)。完整调用链见 JSON。

### 56 修改已提交的轮播图推广申请

**PUT D** `/promotion-banner/apply/modify/{applicationId}`

- 方法: `PromotionApi.modifyApplyPromotion`; 有业务调用。
- 参数: path `applicationId: String`; JSON body [ApplyPromotionDTO](netease-request-bodies.md#applypromotiondto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [PromotionApi.kt:37](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/PromotionApi.kt#L37)。
- 调用约定: 复用 ApplyPromotionDTO 和同一 buildApplyDTO 固定字段；URL 中 id 是 application_id。
- 调用处: [PromotionRepositoryImpl.kt:31](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/PromotionRepositoryImpl.kt#L31)；[PromotionUseCase.kt:72](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/promotion/PromotionUseCase.kt#L72)；[PromotionViewModel.kt:332](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/promotion/PromotionViewModel.kt#L332)。完整调用链见 JSON。

## 玩家反馈与开发者反馈

### 57 分页获取玩家反馈，支持类型和关键字筛选

**GET D** `/items/feedback/pe/`

- 方法: `FeedbackApi.loadFeedback`; 有业务调用。
- 参数: query `start: Int`; query `span: Int`; query `sort: String? = null`; query `order: String? = null`; query `type: String? = null`; query `fuzzy_key: String? = null`; query `reply_count: Int? = null`。
- 返回: `ResponseData<FeedbackVO>`。
- 源码: [FeedbackApi.kt:19](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/FeedbackApi.kt#L19)。
- 调用约定: UI 每页 20，start=page*20；type 取 "0"故障问题、"1"玩法建议、"2"内容侵权、"3"其他、"4"组件冲突、"5"我的山头、"6"性能反馈。
- 调用约定: replyCount 并非已接入的服务端回复筛选；filterReplied 仅作用于已加载列表。
- 调用处: [FeedbackRepositoryImpl.kt:26](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/FeedbackRepositoryImpl.kt#L26)；[FeedbackUseCase.kt:25](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/feedback/FeedbackUseCase.kt#L25)；[FeedbackViewModel.kt:79](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/community/feedback/FeedbackViewModel.kt#L79)。完整调用链见 JSON。

### 58 回复玩家反馈

**PUT D** `/items/feedback/pe/{id}/reply`

- 方法: `FeedbackApi.sendReply`; 有业务调用。
- 参数: path `id: String`; JSON body [ReplyDTO](netease-request-bodies.md#replydto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [FeedbackApi.kt:30](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/FeedbackApi.kt#L30)。
- 调用约定: 请求体是 {content:String}，不是 reply；反馈 VO 含 forbid_reply。
- 调用处: [FeedbackRepositoryImpl.kt:37](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/FeedbackRepositoryImpl.kt#L37)；[FeedbackUseCase.kt:37](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/feedback/FeedbackUseCase.kt#L37)；[FeedbackViewModel.kt:116](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/community/feedback/FeedbackViewModel.kt#L116)。完整调用链见 JSON。

### 59 向网易提交开发者反馈

**POST D** `/developer/feedback/add_feedback/`

- 方法: `FeedbackApi.seedFeedback`; 仅包装层。
- 参数: JSON body [DeveloperFeedbackDTO](netease-request-bodies.md#developerfeedbackdto)。
- 返回: `ResponseData<DeveloperFeedbackVO>`。
- 源码: [FeedbackApi.kt:36](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/FeedbackApi.kt#L36)。
- 调用约定: 已全仓库 *.kt 搜索 submitFeedback( 与 DeveloperFeedbackDTO(；只有 DTO 定义、接口和包装层，没有实际构造或 UI 调用。
- 调用约定: feedback_type/function_type 的合法枚举未在生产调用点确立，不能把玩家反馈 type 的 "0".."6" 直接套用。
- 调用处: [FeedbackRepositoryImpl.kt:43](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/FeedbackRepositoryImpl.kt#L43)；[FeedbackUseCase.kt:44](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/feedback/FeedbackUseCase.kt#L44)。完整调用链见 JSON。

## 玩家评论

### 60 分页获取玩家评论，支持关键词、标签、日期

**GET D** `/items/comment/pe/`

- 方法: `CommentApi.getCommentList`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = 20`; query `fuzzy_key: String? = null`; query `comment_tag: String? = null`; query `comment_state: Int? = null`; query `start_date: String? = null`; query `end_date: String? = null`。
- 返回: `ResponseData<CommentListVO>`。
- 源码: [CommentApi.kt:15](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/CommentApi.kt#L15)。
- 调用约定: 没有 stars 查询参数：星级筛选只对已加载的 CommentData.stars:String 执行客户端过滤。
- 调用约定: 日期由当前系统时区的 LocalDate.toString() 产生：all/null 不传；today 同一天；week/month/quarter 分别回退 7/30/90 天，end_date 为今天。
- 调用约定: comment_tag 来自已加载评论去重；start=page*20。
- 调用处: [CommentRepositoryImpl.kt:25](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/CommentRepositoryImpl.kt#L25)；[CommentUseCase.kt:24](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/comment/CommentUseCase.kt#L24)；[CommentViewModel.kt:87](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/community/comment/CommentViewModel.kt#L87)。完整调用链见 JSON。

### 61 回复玩家评论

**PUT D** `/items/comment/pe/{id}/reply`

- 方法: `CommentApi.replyComment`; 有业务调用。
- 参数: path `id: String`; JSON body [ReplyDTO](netease-request-bodies.md#replydto)。
- 返回: `ResponseData<Unit>`。
- 源码: [CommentApi.kt:26](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/CommentApi.kt#L26)。
- 调用处: [CommentRepositoryImpl.kt:38](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/CommentRepositoryImpl.kt#L38)；[CommentUseCase.kt:38](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/comment/CommentUseCase.kt#L38)；[CommentViewModel.kt:126](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/community/comment/CommentViewModel.kt#L126)。完整调用链见 JSON。

## 消息中心

### 62 获取未读消息数量

**GET D** `/mailbox/unread/count`

- 方法: `MailboxApi.getUnReadCount`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<UnReadMailVO>`。
- 源码: [MailboxApi.kt:21](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/MailboxApi.kt#L21)。
- 调用处: [MailboxRepositoryImpl.kt:21](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/MailboxRepositoryImpl.kt#L21)；[MailboxUseCase.kt:47](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/mailbox/MailboxUseCase.kt#L47)；[MainViewModel.kt:300](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/main/MainViewModel.kt#L300)。完整调用链见 JSON。

### 63 分页获取消息列表及分类/已读聚合统计

**GET D** `/mailbox`

- 方法: `MailboxApi.getMailList`; 有业务调用。
- 参数: query `start: Int = 0`; query `span: Int = 20`; query `initLoad: Boolean = true`; query `title: String? = null`; query `have_read: Boolean? = null`; query `mail_type: String? = null`。
- 返回: `ResponseData<MailListVO>`。
- 源码: [MailboxApi.kt:24](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/MailboxApi.kt#L24)。
- 调用约定: UI mail_type 选项：null=全部、system_notice=系统通知、important_notice=重要通知、review_notice=审核通知、issue_feedback=问题反馈、notify=提醒。
- 调用处: [MailboxRepositoryImpl.kt:32](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/MailboxRepositoryImpl.kt#L32)；[MailboxUseCase.kt:30](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/mailbox/MailboxUseCase.kt#L30)；[MailboxViewModel.kt:40](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/mailbox/MailboxViewModel.kt#L40)。完整调用链见 JSON。

### 64 读取单条消息详情

**GET D** `/mailbox/{mailId}`

- 方法: `MailboxApi.getMailContent`; 有业务调用。
- 参数: path `mailId: String`。
- 返回: `ResponseData<MailContentVO>`。
- 源码: [MailboxApi.kt:34](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/MailboxApi.kt#L34)。
- 调用处: [MailboxRepositoryImpl.kt:36](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/MailboxRepositoryImpl.kt#L36)；[MailboxUseCase.kt:38](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/mailbox/MailboxUseCase.kt#L38)；[MailboxViewModel.kt:114](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/mailbox/MailboxViewModel.kt#L114)。完整调用链见 JSON。

### 65 按消息 id 列表批量删除消息

**POST D** `/mailbox/delete_many`

- 方法: `MailboxApi.deleteMail`; 有业务调用。
- 参数: JSON body [DeleteMailDTO](netease-request-bodies.md#deletemaildto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [MailboxApi.kt:37](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/MailboxApi.kt#L37)。
- 发包路径: `/mailbox/delete_many/`; 内部 `X-Trailing-Slash` 标记在请求前移除。
- 调用约定: 批量删除已读仅收集当前已加载列表中的已读消息 id；请求体是 mail_id_list。
- 调用处: [MailboxRepositoryImpl.kt:39](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/MailboxRepositoryImpl.kt#L39)；[MailboxUseCase.kt:41](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/mailbox/MailboxUseCase.kt#L41)；[MailboxViewModel.kt:143](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/mailbox/MailboxViewModel.kt#L143)。完整调用链见 JSON。

### 66 标记消息已读，当前 UI 用于全部已读

**POST D** `/mailbox/read_mail`

- 方法: `MailboxApi.readMail`; 有业务调用。
- 参数: JSON body [ReadMailDTO](netease-request-bodies.md#readmaildto)。
- 返回: `ResponseData<NoNeedData>`。
- 源码: [MailboxApi.kt:41](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/MailboxApi.kt#L41)。
- 发包路径: `/mailbox/read_mail/`; 内部 `X-Trailing-Slash` 标记在请求前移除。
- 调用约定: ReadMailDTO 默认 mail_id_list=[]，read_all=true；若需要单条/部分已读，必须显式 read_all=false，当前 UI 只调用全部已读。
- 调用约定: JSONConverter encodeDefaults=true，DTO 默认值也会序列化发出。
- 调用处: [MailboxRepositoryImpl.kt:46](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/MailboxRepositoryImpl.kt#L46)；[MailboxUseCase.kt:44](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/mailbox/MailboxUseCase.kt#L44)；[MailboxViewModel.kt:172](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/mailbox/MailboxViewModel.kt#L172)。完整调用链见 JSON。

## 活动红点

### 67 作品入口活动/折扣红点

**GET D** `/others/red-spots`

- 方法: `OtherApi.getRedSpots`; 有业务调用。
- 参数: 无参数。
- 返回: `ResponseData<RedSpotsVO>`。
- 源码: [OtherApi.kt:10](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/OtherApi.kt#L10)。
- 调用处: [OtherRepositoryImpl.kt:16](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/OtherRepositoryImpl.kt#L16)；[WorkContent.kt:84](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/WorkContent.kt#L84)；[WorkContent.kt:177](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/WorkContent.kt#L177)。完整调用链见 JSON。

## 文件上传 token

### 68 按 file_type 与 secure 获取 FP 上传 Policy token

**GET D** `/filepicker/file_token`

- 方法: `FilesApi.getFileToken`; 有业务调用。
- 参数: query `file_type: String`; query `secure: String = "false"`。
- 返回: `ResponseData<GetFileTokenVO>`。
- 源码: [FilesApi.kt:11](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/FilesApi.kt#L11)。
- 调用处: [FileUploadRepositoryImpl.kt:30](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/FileUploadRepositoryImpl.kt#L30)；[FileUploadRepositoryImpl.kt:81](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/FileUploadRepositoryImpl.kt#L81)。完整调用链见 JSON。

## 动态文件上传

**POST U**，`multipart/form-data`。两个实现入口: `UploadApi.uploadFile` 读取文件流, `UploadApi.uploadBytes` 读取字节数组; 它们执行同一种请求。

| 位置 | 字段 | 内容 |
|---|---|---|
| multipart 文本字段 | `Authorization` | `filepicker/file_token` 返回的完整 token; 不是 HTTP Authorization header |
| multipart 文件字段 | `fpfile` | 文件流或字节数组 |
| 文件 part header | `Content-Disposition` | `filename="文件名"` |
| 文件 part header | `Content-Type` | MIME 类型 |
| 响应 header | `x-ntes-signature` | 上传回执的 `sign` |
| 响应 body | 原始字符串 | 与 `file_type`、`sign` 共同封装为 `FileInfoDTO` |

上传 token 形如 `Policy <sig>:<base64-policy>`; 上传地址取解码 policy JSON 的 `url`。不同 file_type 可能签发 FP/PFP 等不同子域。源码仅在解析失败时回退 `https://fp.ps.netease.com/x19/file/new/`, 因此该地址不是所有文件类型通用的实际目的地。

[UploadApi.kt:35](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/UploadApi.kt#L35)；[UploadApi.kt:85](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/UploadApi.kt#L85)；[UploadApi.kt:121](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/UploadApi.kt#L121)。

取得 token -> 上传 -> 读取响应体与签名 -> 把回执放入作品/活动/推广请求。`FileUploadRepositoryImpl` 从响应 `<textarea>` 中提取并 trim 内层 JSON 文本, 并要求签名非空; 最终 `FileInfoDTO.body` 使用该内层文本, 不能把整个 HTML 直接传给后续接口。[FileUploadRepositoryImpl.kt:48](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/repository/FileUploadRepositoryImpl.kt#L48)。

当前调用方上传图片/视频使用 `file_type=image` / `video`, 默认 `secure="false"`; PE zip 包使用 `file_type=zip_package`, 显式 `secure="true"` 和 `application/zip`。[WorkDetailViewModel.kt:860](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/ui/pages/work/workdetail/WorkDetailViewModel.kt#L860)。

## 路径 日期与参数语义

### 末尾斜杠与 308

上面保留参考源码的声明路径, 没有把缺少 `/` 的声明直接当作平台规范路径。`ApiFactory.TrailingSlashPlugin` 只对带内部标记的请求强制补 `/`, 目前是推广申请、消息批量删除和消息已读三个写接口。该标记不会发给网易。

[ApiFactory.kt:29](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/ApiFactory.kt#L29)。

本项目此前无凭据探测确认, `/new_level`、`/data_analysis/overview`、`/items/categories/pe`、`/mailbox` 会 308 跳转到带 `/` 的版本, 查询参数保持不变。其余声明没有逐个线上验证, 不能仅按注解断定是否跳转。后续接入应逐项核对实际 URL, 保留同源跳转约束。

### 分析平台与时间

- 普通分析的 PC 使用 `comp`, 结算列表的 PC 使用 `pc`; 两者不能混用。大厅分析切换到 `data_analysis/goods/*` 并使用 `platform=pe`, `category=pe`, `mc_type="1"`。
- 分析 `start_date`, `end_date`, `day_dateid` 使用 `yyyyMMdd`。日追踪默认 14 天, 模组分析默认 7 天, 均截至昨天。
- 普通日详情 `item_list_str` 是逗号分隔的作品 ID; 大厅日详情是商品 ID; `goods/pe/{iid}/` 与 `lobby_incomes` 的 iid 是所属作品 ID。
- 实时收益的 `begin_time` 为前一日 `16:00:00.000Z`, `end_time` 为所选日 `15:59:59.999Z`, 对应北京时间所选自然日。
- 首页收益速算按目标月首日减 9 天到下月首日减 10 天取数, 例如 2026 年 10 月是 `20260922` 到 `20261022`。这是参考客户端速算取数窗口, 不能视为官方允许申请结算的时间。

[DayDetailUseCase.kt:23](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/DayDetailUseCase.kt#L23)；[RealtimeProfitUseCase.kt:52](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/analyze/RealtimeProfitUseCase.kt#L52)；[MainUseCase.kt:184](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/main/MainUseCase.kt#L184)。

### 排行榜分类

| 分类 | PE first_type | PC first_type |
|---|---:|---:|
| 模组 | 2 | 3 |
| 地图 | 1 | 5 |
| 材质光影 | 3 | 4 |
| 联机大厅 | 6 | 11 |

热搜默认 `first_type=0`, 榜单类型由固定 `type` 区分。PC repository 的默认参数与当前 UseCase 的显式传值不同, 当前页面使用后者。[RankListUseCase.kt:126](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/rankList/RankListUseCase.kt#L126)。

### 互动和消息

- 玩家反馈 `type`: `0` 故障问题, `1` 玩法建议, `2` 内容侵权, `3` 其他, `4` 组件冲突, `5` 我的山头, `6` 性能反馈。开发者反馈的 `feedback_type` / `function_type` 没有可从生产入口确认的合法值集合。
- 反馈 API 声明 `sort`, `order`, `reply_count`, 但当前 repository 未透传这些选项; 回复状态在本地筛选。
- 评论没有 `stars` query, 星级筛选由客户端完成。`comment_state` 虽有声明, 当前 repository 未透传。
- 邮件 `mail_type`: `system_notice`, `important_notice`, `review_notice`, `issue_feedback`, `notify`。
- `ReadMailDTO.read_all` 默认 `true`, `mail_id_list` 默认空数组, 且编码默认值。标记指定消息必须显式 `read_all=false`。
- 推广申请 `start_time` 由 UseCase 传 Unix 秒, `start_time_zone` 固定 `-8`; 不要未经核对换成毫秒或 `+8`。

[ReadMailDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/mailbox/ReadMailDTO.kt#L7)；[PromotionUseCase.kt:37](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/promotion/PromotionUseCase.kt#L37)。

## 非网易调用和纯本地功能

| 项目 | 实际用途 | 计入本清单的网易接口数量 |
|---|---|---|
| `GithubUpdateApi` | GitHub `repos/{author}/{repo}/releases/latest` | 否 |
| `DownloadApi.downloadFile(@Url fileUrl)` | 当前调用链仅下载 GitHub release 的 `browser_download_url`; `https://localhost/` 只是被动态 URL 覆盖的占位基址 | 否 |
| 图片加载器 / 外部浏览器 | 使用响应中图片或网页 URL, 没有新增固定网易 JSON API 声明 | 不另计固定接口 |
| 收益速算、税额、补贴、rankChange | 本地函数 | 否 |
| 账号增删切换、主题、日志、配置 | 本地数据库或平台功能 | 否 |

Cookie 导入通过 `GET users/me` 验证, 没有另一个“Cookie 登录”HTTP 接口。该版本 `UserInfoVO` 没有声明开发者 UID, 不应据此杜撰 `/user/uid` 等未找到的接口。

[DownloadApi.kt:10](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/api/DownloadApi.kt#L10)；[LoginUseCase.kt:75](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/domain/login/LoginUseCase.kt#L75)；[UserInfoVO.kt:11](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/vo/netease/user/UserInfoVO.kt#L11)。

## 调用状态与完整性

只声明或没有生产页面调用的项目仍保留, 避免把“原项目可提供的接口”和“当前界面执行的请求”混为一谈。已确认包括 `InfoApi.getResInfoList`、`IncomeApi.getIncentiveFund`、`FeedbackApi.seedFeedback`; 完整状态逐项保存在 JSON。

同一路径可能由不同 API 类重复声明, 也可能通过 query 承担不同用途。例如资源列表在 InfoApi 与 ResourceApi 均声明, PE 前置模组搜索则是列表携带 `pri_type=9` 的筛选变体。六个榜单方法只有两个路径, 通过固定 `type` 区分六种榜单。

清单覆盖 API 注解、两个直接 multipart 上传入口及生产源码中的其他 HTTP 调用检查; 未触发真实回复、删除、报名、发布或结算操作。每项的源码和调用链均固定到上述提交, 后续升级参考版本时应按提交差异复核。
