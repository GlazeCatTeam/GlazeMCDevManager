# 网易接口请求体字段

本附录对应 [接口总清单](netease-api-catalog.md), 列出该版本实际请求 DTO、登录加密前参数及其嵌套模型的字段。JSON 名称取 `SerialName`, 类型与默认值保留 Kotlin 声明, 不代表服务器将这些字段全部视为必填或接受这些默认值。

来源: [MCDevManager mp-master](https://github.com/BitterLemonn/MCDevManager/tree/d7ecc75dac449addd0782870b85fc25fc1447bee), 提交 `d7ecc75dac449addd0782870b85fc25fc1447bee`, 核对日期 2026-10-15。

共 31 个请求或嵌套模型, 392 个字段。响应模型字段见 [JSON 索引](netease-api-catalog.json) 的 `models`。

空白默认值显示为“未声明”; `?` 表示 Kotlin 可空类型。`JSONConverter` 开启 `encodeDefaults=true`, 关闭 `explicitNulls`, 因此默认值会编码而 null 字段通常省略。不同场景的 mapper 可能覆盖默认值。

## 新建与更新作品的差异

`WorkCreateDTO` 和 `WorkUpdateDTO` 不是同一请求体。新建的 `res[].res_url`、`channel[].channel_url` 为上传回执 `FileInfoDTO` 对象; 编辑的 `res` / `channel` 为 `List<JsonObject>`, 内部 URL 项可保留已有字符串或使用新上传回执对象。编辑由 `ResourceDetailVO.toWorkUpdateDTO` 保留旧详情字段, 不能把新建默认对象当作编辑模板。

新建独有字段包括 `available_scope`, `brief`, `game_host`, `include_map`, `tags`; 编辑独有字段包括 `corp_proof_image`, `discount`, `play_plan_expire_time`, `pre_review_video`, `relate_item_id`, `relate_item_weak_offline`, `sync_item_info`。`collection_id` 在新建是 Int, 编辑是 String; `mc_version` 类型也不同。详见下面逐字段表和 JSON 的 `payloadSerializationAudit`。

`AppointOnlineDTO.appoint_online_time` 的源码注释称 null 可取消定时, 但全局 `explicitNulls=false` 会省略 null。2026-10-16 核对[网易官方网页脚本](https://mcdev.webapp.163.com/static/js/14.605f7cf8d838f3a5ce7e.js)确认取消预约使用 PUT `/items/categories/pe/{id}/appoint_online`, 请求体为 `{"appoint_online_time":null}`, 不附加 `op_platform`; 本项目按此协议实现, 未用真实作品执行取消验收。

## 登录参数与文件回执

四个登录 POST 的线上外层 body 都是 `EncParamsDTO { encParams }`。`GetCapIdDTO`、`GetPowerDTO`、`TicketDTO`、`LoginDTO` 是加密前的明文字段模型; `pw` 先经 RSA 处理, 不能将明文密码直接装入该字段。

`FileInfoDTO.body` 保存上传响应体字符串, `sign` 来自响应 header `x-ntes-signature`, `file_type` 与申请 token 时一致。它不是只有下载 URL 的对象。

## ApplyIncomeDTO

[ApplyIncomeDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/income/ApplyIncomeDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `income_id` | `incomeIds` | `List<String>` | 未声明 |

## ApplyPromotionDTO

[ApplyPromotionDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/promotion/ApplyPromotionDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `position_id` | `positionId` | `String` | 未声明 |
| `start_time` | `startTime` | `Long` | 未声明 |
| `item_id` | `itemId` | `String` | 未声明 |
| `item_category` | `itemCategory` | `String` | 未声明 |
| `extra` | `extra` | `String` | 未声明 |
| `activity` | `activity` | `String` | 未声明 |
| `feature` | `feature` | `String` | 未声明 |
| `update` | `update` | `String` | 未声明 |
| `pe_channel` | `peChannel` | `String` | 未声明 |
| `special_promotion` | `specialPromotion` | `Boolean` | 未声明 |
| `start_time_zone` | `startTimeZone` | `Int` | 未声明 |
| `is_check` | `isCheck` | `Boolean` | 未声明 |

## ApplyReviewDTO

[WorkReviewDTOs.kt:8](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkReviewDTOs.kt#L8)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `apply_review_text` | `applyReviewText` | `String` | `""` |
| `conflict_notify` | `conflictNotify` | `Int` | `0` |
| `conflict_notify_type` | `conflictNotifyType` | `List<Int>?` | `null` |
| `is_check_apply` | `isCheckApply` | `Boolean` | `false` |

## ApplySelfTestDTO

[ApplySelfTestDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/ApplySelfTestDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `self_test_pass_check` | `selfTestPassCheck` | `Boolean` | `false` |

## AppointOnlineDTO

[WorkReviewDTOs.kt:21](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkReviewDTOs.kt#L21)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `appoint_online_time` | `appointOnlineTime` | `String?` | `null` |
| `op_platform` | `opPlatform` | `String` | `"all"` |

## CancelJoinDiscountDTO

[CancelJoinDiscountDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/activity/CancelJoinDiscountDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `activity_id` | `activityId` | `String` | 未声明 |
| `item_id` | `itemId` | `String` | 未声明 |

## ChangePriceDTO

[ChangePriceDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/ChangePriceDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `price` | `price` | `Int` | 未声明 |
| `price_rank` | `priceRank` | `Int` | 未声明 |
| `price_type` | `priceType` | `String` | 未声明 |

## DeleteMailDTO

[DeleteMailDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/mailbox/DeleteMailDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `mail_id_list` | `mailIdList` | `List<String>` | 未声明 |

## DeveloperFeedbackDTO

[DeveloperFeedbackDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/feedback/DeveloperFeedbackDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `feedback_type` | `feedbackType` | `String` | 未声明 |
| `function_type` | `functionType` | `String` | 未声明 |
| `desc` | `content` | `String` | 未声明 |
| `contact` | `contact` | `String` | 未声明 |
| `extra_list` | `extraList` | `List<String>` | `emptyList()` |

## EncParamsDTO

[LoginDTO.kt:12](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/login/LoginDTO.kt#L12)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `encParams` | `encParams` | `String` | 未声明 |

## FileInfoDTO

[JoinActivityDTO.kt:19](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/activity/JoinActivityDTO.kt#L19)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `body` | `body` | `String` | 未声明 |
| `file_type` | `fileType` | `String` | 未声明 |
| `sign` | `sign` | `String` | 未声明 |

## GetCapIdDTO

[LoginDTO.kt:55](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/login/LoginDTO.kt#L55)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `pd` | `pd` | `String` | `PD` |
| `pkid` | `pkid` | `String` | `PKID` |
| `pkht` | `pkht` | `String` | `PKHT` |
| `channel` | `channel` | `Int` | `CHANNEL` |
| `topURL` | `topURL` | `String` | 未声明 |
| `rtid` | `rtid` | `String` | `getRandomTid()` |

## GetPowerDTO

[LoginDTO.kt:45](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/login/LoginDTO.kt#L45)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `pkid` | `pkid` | `String` | `PKID` |
| `pd` | `pd` | `String` | `PD` |
| `un` | `un` | `String` | 未声明 |
| `channel` | `channel` | `Int` | `CHANNEL` |
| `topURL` | `topURL` | `String` | 未声明 |
| `rtid` | `rtid` | `String` | `getRandomTid()` |

## JoinActivityDTO

[JoinActivityDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/activity/JoinActivityDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `item_id` | `itemId` | `String` | 未声明 |
| `apply_intro` | `applyIntro` | `String` | 未声明 |
| `video_info_list` | `videoInfoList` | `List<FileInfoDTO>` | `emptyList()` |
| `image_list` | `imageList` | `List<FileInfoDTO>` | `emptyList()` |

## JoinDiscountDTO

[JoinDiscountDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/activity/JoinDiscountDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `activity_id` | `activityId` | `String` | 未声明 |
| `module_id` | `moduleId` | `String` | 未声明 |
| `item_id_list` | `itemIdList` | `List<String>` | 未声明 |
| `discount` | `discount` | `Int` | 未声明 |
| `partition_id` | `partitionId` | `String` | 未声明 |
| `intro` | `intro` | `String` | 未声明 |

## LoginDTO

[LoginDTO.kt:27](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/login/LoginDTO.kt#L27)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `un` | `un` | `String` | 未声明 |
| `pw` | `pw` | `String` | 未声明 |
| `pd` | `pd` | `String` | `PD` |
| `l` | `l` | `Int` | `0` |
| `d` | `d` | `Int` | `10` |
| `t` | `t` | `Long` | `Clock.System.now().toEpochMilliseconds()` |
| `tk` | `tk` | `String` | 未声明 |
| `pwdKeyUp` | `pwdKeyUp` | `Int` | `1` |
| `pkid` | `pkid` | `String` | `PKID` |
| `domains` | `domains` | `String` | `""` |
| `pvParam` | `pvParam` | `PVResultStrDTO` | 未声明 |
| `channel` | `channel` | `Int` | `CHANNEL` |
| `topURL` | `topURL` | `String` | 未声明 |
| `rtid` | `rtid` | `String` | `getRandomTid()` |

## OnlineItemDTO

[WorkReviewDTOs.kt:17](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkReviewDTOs.kt#L17)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `op_platform` | `opPlatform` | `String` | `"all"` |

## PVResultStrDTO

[LoginDTO.kt:65](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/login/LoginDTO.kt#L65)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `maxTime` | `maxTime` | `Int` | 未声明 |
| `puzzle` | `puzzle` | `String` | 未声明 |
| `spendTime` | `spendTime` | `Int` | 未声明 |
| `runTimes` | `runTimes` | `Int` | 未声明 |
| `sid` | `sid` | `String` | 未声明 |
| `args` | `args` | `String` | 未声明 |

## ReadMailDTO

[ReadMailDTO.kt:7](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/mailbox/ReadMailDTO.kt#L7)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `mail_id_list` | `mailIdList` | `List<String>` | `emptyList()` |
| `read_all` | `readAll` | `Boolean` | `true` |

## ReplyDTO

[ReplyDTO.kt:6](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/feedback/ReplyDTO.kt#L6)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `content` | `content` | `String` | 未声明 |

## ResourceDetailTag

[ResourceListVO.kt:395](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/vo/netease/resource/ResourceListVO.kt#L395)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `name` | `name` | `String` | `"", val source: Int = 0` |

## ResourceDetailVideoInfo

[ResourceListVO.kt:398](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/vo/netease/resource/ResourceListVO.kt#L398)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `cover` | `cover` | `String` | `"", val size: Int = 0, val url: String = ""` |

## ResourceRequirementData

[ResourceListVO.kt:401](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/vo/netease/resource/ResourceListVO.kt#L401)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `item_id` | `itemId` | `String` | `""` |
| `item_name` | `itemName` | `String` | `""` |

## TicketDTO

[LoginDTO.kt:17](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/login/LoginDTO.kt#L17)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `un` | `un` | `String` | 未声明 |
| `pd` | `pd` | `String` | `PD` |
| `pkid` | `pkid` | `String` | `PKID` |
| `channel` | `channel` | `Int` | `CHANNEL` |
| `topURL` | `topURL` | `String` | 未声明 |
| `rtid` | `rtid` | `String` | `getRandomTid()` |

## WorkCreateChannel

[WorkCreateDTO.kt:170](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkCreateDTO.kt#L170)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `channel_id` | `channelId` | `Int` | 未声明 |
| `channel_url` | `channelUrl` | `FileInfoDTO` | 未声明 |
| `version` | `version` | `Int` | `1` |

## WorkCreateDTO

[WorkCreateDTO.kt:22](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkCreateDTO.kt#L22)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `item_name` | `itemName` | `String` | `""` |
| `mc_version` | `mcVersion` | `List<JsonElement>` | `emptyList()` |
| `online_platform` | `onlinePlatform` | `List<JsonElement>` | `emptyList()` |
| `label_type_list` | `labelTypeList` | `List<Int>` | `emptyList()` |
| `pri_type` | `priType` | `Int` | `0` |
| `sub_type` | `subType` | `Int` | `0` |
| `info` | `info` | `String` | `""` |
| `rarity` | `rarity` | `Int` | `0` |
| `lobby_min_num` | `lobbyMinNum` | `Int` | `0` |
| `lobby_max_num` | `lobbyMaxNum` | `Int` | `0` |
| `lobby_force_max_num` | `lobbyForceMaxNum` | `Int` | `10` |
| `lobby_tags` | `lobbyTags` | `List<JsonElement>` | `emptyList()` |
| `include_map` | `includeMap` | `Boolean` | `false` |
| `tag` | `tag` | `List<ResourceDetailTag>` | `emptyList()` |
| `multi_tags` | `multiTags` | `String` | `""` |
| `requirement` | `requirement` | `List<JsonElement>` | `emptyList()` |
| `mod_id` | `modId` | `Int` | `0` |
| `available_scope` | `availableScope` | `String` | `""` |
| `force_encrypt` | `forceEncrypt` | `Boolean` | `false` |
| `price_type` | `priceType` | `String` | `"free"` |
| `price_rank` | `priceRank` | `Int` | `0` |
| `trial_duration` | `trialDuration` | `Int` | `0` |
| `price` | `price` | `Int` | `0` |
| `ios_price` | `iosPrice` | `Int` | `0` |
| `ios_price_type` | `iosPriceType` | `String` | `""` |
| `ios_jelly_id` | `iosJellyId` | `String` | `""` |
| `android_price` | `androidPrice` | `Int` | `0` |
| `android_price_type` | `androidPriceType` | `String` | `""` |
| `adv_obtain_num` | `advObtainNum` | `Int` | `0` |
| `brief` | `brief` | `String` | `""` |
| `pe_game_introduction` | `peGameIntroduction` | `String` | `""` |
| `game_host` | `gameHost` | `String` | `""` |
| `pure` | `pure` | `Boolean` | `false` |
| `java_version` | `javaVersion` | `String` | `""` |
| `activity_desc` | `activityDesc` | `String` | `""` |
| `claim_item_enabled` | `claimItemEnabled` | `Boolean` | `false` |
| `body_type` | `bodyType` | `String` | `""` |
| `current_change_log` | `currentChangeLog` | `String` | `""` |
| `dyeing_relation` | `dyeingRelation` | `JsonObject` | `JsonObject(emptyMap())` |
| `pe_item_id` | `peItemId` | `List<JsonElement>` | `emptyList()` |
| `pe_emotes_id` | `peEmotesId` | `List<JsonElement>` | `emptyList()` |
| `pe_mc_item_id` | `peMcItemId` | `List<JsonElement>` | `emptyList()` |
| `pe_home_cash` | `peHomeCash` | `List<JsonElement>` | `emptyList()` |
| `pe_frame_id` | `peFrameId` | `List<JsonElement>` | `emptyList()` |
| `pe_furniture_id` | `peFurnitureId` | `List<JsonElement>` | `emptyList()` |
| `pe_six_month_vip_id` | `peSixMonthVipId` | `List<JsonElement>` | `emptyList()` |
| `pe_passport_ten_id` | `pePassportTenId` | `List<JsonElement>` | `emptyList()` |
| `pe_user_background_id` | `peUserBackgroundId` | `List<JsonElement>` | `emptyList()` |
| `pe_activity_coupon` | `peActivityCoupon` | `List<JsonElement>` | `emptyList()` |
| `pe_chat_bubble_id` | `peChatBubbleId` | `List<JsonElement>` | `emptyList()` |
| `pe_one_month_vip_id` | `peOneMonthVipId` | `List<JsonElement>` | `emptyList()` |
| `pe_lottery_chance` | `peLotteryChance` | `List<JsonElement>` | `emptyList()` |
| `prerequisite_item_ids` | `prerequisiteItemIds` | `List<JsonElement>` | `emptyList()` |
| `prerequisite_items` | `prerequisiteItems` | `List<JsonElement>` | `emptyList()` |
| `mod_version` | `modVersion` | `String` | `""` |
| `is_lobby_competitive` | `isLobbyCompetitive` | `Boolean` | `false` |
| `is_asymmetric` | `isAsymmetric` | `Boolean` | `false` |
| `lobby_camps` | `lobbyCamps` | `List<JsonElement>` | `emptyList()` |
| `lobby_player_num` | `lobbyPlayerNum` | `Int` | `0` |
| `lobby_normal_mode` | `lobbyNormalMode` | `Boolean` | `false` |
| `lobby_reconnect_time` | `lobbyReconnectTime` | `Int` | `0` |
| `subject_id` | `subjectId` | `JsonElement` | `JsonNull` |
| `is_sync` | `isSync` | `Boolean` | `false` |
| `vip_only` | `vipOnly` | `Boolean` | `false` |
| `is_season_mod` | `isSeasonMod` | `Boolean` | `false` |
| `activity_only` | `activityOnly` | `Boolean` | `false` |
| `searchable` | `searchable` | `Boolean` | `true` |
| `is_original` | `isOriginal` | `Boolean` | `true` |
| `anti_cheat_enable` | `antiCheatEnable` | `Int` | `0` |
| `lobby_commercialize` | `lobbyCommercialize` | `Boolean` | `false` |
| `version_compatible_enable` | `versionCompatibleEnable` | `Boolean` | `false` |
| `mount_call_enabled` | `mountCallEnabled` | `Boolean` | `false` |
| `is_ea` | `isEa` | `Int` | `0` |
| `achievement_enabled` | `achievementEnabled` | `Int` | `0` |
| `achievement_configs` | `achievementConfigs` | `List<JsonElement>` | `emptyList()` |
| `achievement_background_url` | `achievementBackgroundUrl` | `String` | `""` |
| `is_spigot` | `isSpigot` | `Boolean` | `false` |
| `banner_pic` | `bannerPic` | `String` | `""` |
| `season_begin` | `seasonBegin` | `Int` | `0` |
| `is_lottery_reward` | `isLotteryReward` | `Boolean` | `false` |
| `item_update_push` | `itemUpdatePush` | `Boolean` | `true` |
| `lottery_id` | `lotteryId` | `Int` | `0` |
| `is_persona` | `isPersona` | `Boolean` | `false` |
| `is_recommend` | `isRecommend` | `Boolean` | `false` |
| `exchange_currency` | `exchangeCurrency` | `Int` | `0` |
| `exchange_currency_type` | `exchangeCurrencyType` | `String` | `"ordinary"` |
| `decompose_currency` | `decomposeCurrency` | `Int` | `0` |
| `decompose_currency_type` | `decomposeCurrencyType` | `String` | `"ordinary"` |
| `persona_mtypeid` | `personaMtypeid` | `Int` | `0` |
| `persona_stypeid` | `personaStypeid` | `Int` | `0` |
| `dyeing` | `dyeing` | `String` | `""` |
| `need_method_uuid` | `needMethodUuid` | `Boolean` | `false` |
| `need_behaviour_uuid` | `needBehaviourUuid` | `Boolean` | `false` |
| `dyeing_origin` | `dyeingOrigin` | `Boolean` | `false` |
| `is_vip_benefit` | `isVipBenefit` | `Boolean` | `false` |
| `is_test_server` | `isTestServer` | `Boolean` | `false` |
| `is_access_by_uid` | `isAccessByUid` | `Boolean` | `false` |
| `is_can_comment` | `isCanComment` | `Boolean` | `false` |
| `weak_offline` | `weakOffline` | `Boolean` | `false` |
| `weak_offline_reason` | `weakOfflineReason` | `String` | `""` |
| `is_quick_upload` | `isQuickUpload` | `Boolean` | `false` |
| `running_status` | `runningStatus` | `String` | `"normal"` |
| `white_list` | `whiteList` | `List<JsonElement>` | `emptyList()` |
| `silent_white_list` | `silentWhiteList` | `List<JsonElement>` | `emptyList()` |
| `is_joint_activity` | `isJointActivity` | `Boolean` | `false` |
| `joint_activity_detail` | `jointActivityDetail` | `JsonObject` | `JsonObject(emptyMap())` |
| `joint_activity_name` | `jointActivityName` | `String` | `""` |
| `joint_activity_tag` | `jointActivityTag` | `List<JsonElement>` | `emptyList()` |
| `collection_id` | `collectionId` | `Int` | `0` |
| `collection_name` | `collectionName` | `String` | `""` |
| `is_official_item` | `isOfficialItem` | `Boolean` | `false` |
| `openbeta_time` | `openbetaTime` | `JsonElement` | `JsonNull` |
| `commercial_time` | `commercialTime` | `JsonElement` | `JsonNull` |
| `pe_is_add_play_plan` | `peIsAddPlayPlan` | `Boolean` | `false` |
| `play_plan_expire_month` | `playPlanExpireMonth` | `Int?` | `null` |
| `mod_second_type` | `modSecondType` | `Int` | `0` |
| `res` | `res` | `List<WorkCreateRes>` | `emptyList()` |
| `channel` | `channel` | `List<WorkCreateChannel>` | `emptyList()` |
| `video_info_list` | `videoInfoList` | `List<JsonElement>` | `emptyList()` |
| `item_id` | `itemId` | `String` | `""` |
| `vanity_number` | `vanityNumber` | `String` | `""` |
| `normal_number` | `normalNumber` | `String` | `""` |
| `remove_domain_server_reason` | `removeDomainServerReason` | `String` | `""` |
| `item_version` | `itemVersion` | `String` | `""` |
| `main_city` | `mainCity` | `Boolean` | `false` |
| `is_domain_server_item` | `isDomainServerItem` | `Int` | `0` |
| `dlc_info` | `dlcInfo` | `WorkUpdateDlcInfoDTO` | `WorkUpdateDlcInfoDTO()` |
| `sync_pc_flag` | `syncPcFlag` | `Boolean` | `false` |
| `tags` | `tags` | `List<JsonElement>` | `emptyList()` |
| `update_summary` | `updateSummary` | `String` | `""` |
| `guide_list` | `guideList` | `List<JsonElement>` | `emptyList()` |
| `charge_type` | `chargeType` | `String` | `"worlds"` |
| `charge_desc` | `chargeDesc` | `String` | `""` |
| `is_check_apply` | `isCheckApply` | `Boolean` | `false` |

## WorkCreateRes

[WorkCreateDTO.kt:161](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkCreateDTO.kt#L161)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `res_url` | `resUrl` | `FileInfoDTO` | 未声明 |
| `res_name` | `resName` | `String` | `""` |
| `mc_version` | `mcVersion` | `List<JsonElement>` | `emptyList()` |
| `add_version` | `addVersion` | `Boolean` | `true` |

## WorkUpdateDTO

[WorkUpdateDTOs.kt:26](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkUpdateDTOs.kt#L26)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `is_check_apply` | `isCheckApply` | `Boolean` | `false` |
| `pre_review_video` | `preReviewVideo` | `String` | `"{}"` |
| `item_name` | `itemName` | `String` | `""` |
| `item_id` | `itemId` | `String` | `""` |
| `item_version` | `itemVersion` | `String` | `""` |
| `normal_number` | `normalNumber` | `String` | `""` |
| `mc_version` | `mcVersion` | `List<String>` | `emptyList()` |
| `online_platform` | `onlinePlatform` | `List<JsonElement>` | `emptyList()` |
| `label_type_list` | `labelTypeList` | `List<Int>` | `emptyList()` |
| `pri_type` | `priType` | `Int` | `0` |
| `sub_type` | `subType` | `Int` | `0` |
| `mod_second_type` | `modSecondType` | `Int` | `0` |
| `mod_version` | `modVersion` | `String` | `""` |
| `info` | `info` | `String` | `""` |
| `rarity` | `rarity` | `Int` | `0` |
| `tag` | `tag` | `List<ResourceDetailTag>` | `emptyList()` |
| `multi_tags` | `multiTags` | `String` | `"0"` |
| `requirement` | `requirement` | `List<JsonElement>` | `emptyList()` |
| `mod_id` | `modId` | `Int` | `0` |
| `java_version` | `javaVersion` | `String` | `""` |
| `update_summary` | `updateSummary` | `String` | `""` |
| `current_change_log` | `currentChangeLog` | `String` | `""` |
| `activity_desc` | `activityDesc` | `String` | `""` |
| `pe_game_introduction` | `peGameIntroduction` | `String` | `""` |
| `body_type` | `bodyType` | `String` | `""` |
| `vanity_number` | `vanityNumber` | `String` | `""` |
| `remove_domain_server_reason` | `removeDomainServerReason` | `String` | `""` |
| `price_type` | `priceType` | `String` | `""` |
| `price_rank` | `priceRank` | `Int` | `0` |
| `trial_duration` | `trialDuration` | `Int` | `0` |
| `price` | `price` | `Int` | `0` |
| `ios_price` | `iosPrice` | `Int` | `0` |
| `ios_price_type` | `iosPriceType` | `String` | `""` |
| `ios_jelly_id` | `iosJellyId` | `String` | `""` |
| `android_price` | `androidPrice` | `Int` | `0` |
| `android_price_type` | `androidPriceType` | `String` | `""` |
| `adv_obtain_num` | `advObtainNum` | `Int` | `0` |
| `force_encrypt` | `forceEncrypt` | `Boolean` | `false` |
| `pure` | `pure` | `Boolean` | `false` |
| `claim_item_enabled` | `claimItemEnabled` | `Boolean` | `false` |
| `exchange_currency` | `exchangeCurrency` | `Int` | `0` |
| `exchange_currency_type` | `exchangeCurrencyType` | `String` | `"ordinary"` |
| `decompose_currency` | `decomposeCurrency` | `Int` | `0` |
| `decompose_currency_type` | `decomposeCurrencyType` | `String` | `"ordinary"` |
| `discount` | `discount` | `List<JsonElement>` | `emptyList()` |
| `charge_type` | `chargeType` | `String` | `""` |
| `charge_desc` | `chargeDesc` | `String` | `""` |
| `lobby_min_num` | `lobbyMinNum` | `Int` | `0` |
| `lobby_max_num` | `lobbyMaxNum` | `Int` | `0` |
| `lobby_force_max_num` | `lobbyForceMaxNum` | `Int` | `0` |
| `lobby_tags` | `lobbyTags` | `List<JsonElement>` | `emptyList()` |
| `lobby_camps` | `lobbyCamps` | `List<JsonElement>` | `emptyList()` |
| `lobby_player_num` | `lobbyPlayerNum` | `Int` | `0` |
| `lobby_normal_mode` | `lobbyNormalMode` | `Boolean` | `false` |
| `lobby_reconnect_time` | `lobbyReconnectTime` | `Int` | `0` |
| `is_lobby_competitive` | `isLobbyCompetitive` | `Boolean` | `false` |
| `is_asymmetric` | `isAsymmetric` | `Boolean` | `false` |
| `lobby_commercialize` | `lobbyCommercialize` | `Boolean` | `false` |
| `pe_item_id` | `peItemId` | `List<JsonElement>` | `emptyList()` |
| `pe_emotes_id` | `peEmotesId` | `List<JsonElement>` | `emptyList()` |
| `pe_mc_item_id` | `peMcItemId` | `List<JsonElement>` | `emptyList()` |
| `pe_home_cash` | `peHomeCash` | `List<JsonElement>` | `emptyList()` |
| `pe_frame_id` | `peFrameId` | `List<JsonElement>` | `emptyList()` |
| `pe_furniture_id` | `peFurnitureId` | `List<JsonElement>` | `emptyList()` |
| `pe_six_month_vip_id` | `peSixMonthVipId` | `List<JsonElement>` | `emptyList()` |
| `pe_passport_ten_id` | `pePassportTenId` | `List<JsonElement>` | `emptyList()` |
| `pe_user_background_id` | `peUserBackgroundId` | `List<JsonElement>` | `emptyList()` |
| `pe_activity_coupon` | `peActivityCoupon` | `List<JsonElement>` | `emptyList()` |
| `pe_chat_bubble_id` | `peChatBubbleId` | `List<JsonElement>` | `emptyList()` |
| `pe_one_month_vip_id` | `peOneMonthVipId` | `List<JsonElement>` | `emptyList()` |
| `pe_lottery_chance` | `peLotteryChance` | `List<JsonElement>` | `emptyList()` |
| `subject_id` | `subjectId` | `JsonElement` | `JsonNull` |
| `is_sync` | `isSync` | `Boolean` | `false` |
| `sync_pc_flag` | `syncPcFlag` | `Boolean` | `false` |
| `vip_only` | `vipOnly` | `Boolean` | `false` |
| `is_season_mod` | `isSeasonMod` | `Boolean` | `false` |
| `activity_only` | `activityOnly` | `Boolean` | `false` |
| `searchable` | `searchable` | `Boolean` | `false` |
| `is_original` | `isOriginal` | `Boolean` | `true` |
| `corp_proof_image` | `corpProofImage` | `String?` | `null` |
| `anti_cheat_enable` | `antiCheatEnable` | `Int` | `0` |
| `version_compatible_enable` | `versionCompatibleEnable` | `Boolean` | `false` |
| `mount_call_enabled` | `mountCallEnabled` | `Boolean` | `false` |
| `is_ea` | `isEa` | `Int` | `0` |
| `achievement_enabled` | `achievementEnabled` | `Int` | `0` |
| `achievement_configs` | `achievementConfigs` | `List<JsonElement>` | `emptyList()` |
| `achievement_background_url` | `achievementBackgroundUrl` | `String` | `""` |
| `is_spigot` | `isSpigot` | `Boolean` | `false` |
| `banner_pic` | `bannerPic` | `String` | `""` |
| `season_begin` | `seasonBegin` | `Int` | `0` |
| `is_lottery_reward` | `isLotteryReward` | `Boolean` | `false` |
| `item_update_push` | `itemUpdatePush` | `Boolean` | `false` |
| `lottery_id` | `lotteryId` | `Int` | `0` |
| `is_persona` | `isPersona` | `Boolean` | `false` |
| `is_recommend` | `isRecommend` | `Boolean` | `false` |
| `need_method_uuid` | `needMethodUuid` | `Boolean` | `false` |
| `need_behaviour_uuid` | `needBehaviourUuid` | `Boolean` | `false` |
| `dyeing_origin` | `dyeingOrigin` | `Boolean` | `false` |
| `is_vip_benefit` | `isVipBenefit` | `Boolean` | `false` |
| `is_test_server` | `isTestServer` | `Boolean` | `false` |
| `is_access_by_uid` | `isAccessByUid` | `Boolean` | `false` |
| `is_can_comment` | `isCanComment` | `Boolean` | `false` |
| `is_quick_upload` | `isQuickUpload` | `Boolean` | `false` |
| `weak_offline` | `weakOffline` | `Boolean` | `false` |
| `weak_offline_reason` | `weakOfflineReason` | `String` | `""` |
| `running_status` | `runningStatus` | `String` | `"normal"` |
| `is_domain_server_item` | `isDomainServerItem` | `Int` | `0` |
| `main_city` | `mainCity` | `Boolean` | `false` |
| `pe_is_add_play_plan` | `peIsAddPlayPlan` | `Boolean` | 未声明 |
| `play_plan_expire_time` | `playPlanExpireTime` | `Int?` | `null` |
| `play_plan_expire_month` | `playPlanExpireMonth` | `Int?` | `null` |
| `dyeing_relation` | `dyeingRelation` | `JsonObject` | `JsonObject(emptyMap())` |
| `dyeing` | `dyeing` | `String` | `""` |
| `persona_mtypeid` | `personaMtypeid` | `Int` | `0` |
| `persona_stypeid` | `personaStypeid` | `Int` | `0` |
| `relate_item_id` | `relateItemId` | `Long` | `0` |
| `prerequisite_item_ids` | `prerequisiteItemIds` | `List<JsonElement>` | `emptyList()` |
| `prerequisite_items` | `prerequisiteItems` | `List<JsonElement>` | `emptyList()` |
| `relate_item_weak_offline` | `relateItemWeakOffline` | `Boolean` | `false` |
| `white_list` | `whiteList` | `List<JsonElement>` | `emptyList()` |
| `silent_white_list` | `silentWhiteList` | `List<JsonElement>` | `emptyList()` |
| `is_joint_activity` | `isJointActivity` | `Boolean` | `false` |
| `joint_activity_detail` | `jointActivityDetail` | `JsonObject` | `JsonObject(emptyMap())` |
| `joint_activity_name` | `jointActivityName` | `String` | `""` |
| `joint_activity_tag` | `jointActivityTag` | `List<JsonElement>` | `emptyList()` |
| `collection_id` | `collectionId` | `String` | `"0"` |
| `collection_name` | `collectionName` | `String` | `""` |
| `is_official_item` | `isOfficialItem` | `Boolean` | `false` |
| `openbeta_time` | `openbetaTime` | `JsonElement` | `JsonNull` |
| `commercial_time` | `commercialTime` | `JsonElement` | `JsonNull` |
| `res` | `res` | `List<JsonObject>` | `emptyList()` |
| `channel` | `channel` | `List<JsonObject>` | `emptyList()` |
| `video_info_list` | `videoInfoList` | `List<ResourceDetailVideoInfo>` | `emptyList()` |
| `dlc_info` | `dlcInfo` | `WorkUpdateDlcInfoDTO` | `WorkUpdateDlcInfoDTO()` |
| `guide_list` | `guideList` | `List<JsonElement>` | `emptyList()` |
| `sync_item_info` | `syncItemInfo` | `WorkUpdateSyncItemInfoDTO?` | `null` |

## WorkUpdateDlcInfoDTO

[WorkUpdateDTOs.kt:171](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkUpdateDTOs.kt#L171)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `dlc_switch` | `dlcSwitch` | `Boolean` | `false` |
| `dlc_type` | `dlcType` | `String` | `"off"` |
| `master` | `master` | `JsonObject` | `JsonObject(emptyMap())` |
| `slave_list` | `slaveList` | `List<JsonElement>` | `emptyList()` |

## WorkUpdateSyncChannelDTO

[WorkUpdateDTOs.kt:199](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkUpdateDTOs.kt#L199)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `channel_id` | `channelId` | `Int` | `0` |
| `channel_url` | `channelUrl` | `JsonElement` | `JsonPrimitive("")` |
| `channel_required` | `channelRequired` | `Boolean` | `false` |
| `version` | `version` | `Int` | `0` |

## WorkUpdateSyncItemInfoDTO

[WorkUpdateDTOs.kt:179](https://github.com/BitterLemonn/MCDevManager/blob/d7ecc75dac449addd0782870b85fc25fc1447bee/shared/src/commonMain/kotlin/com/lemon/mcdevmanagermp/data/dto/netease/work/WorkUpdateDTOs.kt#L179)。

| JSON 字段 | Kotlin 属性 | 类型 | 客户端默认值 |
|---|---|---|---|
| `weak_offline` | `weakOffline` | `Boolean` | `false` |
| `weak_offline_reason` | `weakOfflineReason` | `String` | `""` |
| `item_id` | `itemId` | `String` | `""` |
| `item_name` | `itemName` | `String` | `""` |
| `category` | `category` | `String` | `""` |
| `include_map` | `includeMap` | `Boolean` | `false` |
| `tag` | `tag` | `List<Int>` | `emptyList()` |
| `requirement` | `requirement` | `List<ResourceRequirementData>` | `emptyList()` |
| `brief` | `brief` | `String` | `""` |
| `game_host` | `gameHost` | `String` | `""` |
| `info` | `info` | `String` | `""` |
| `available_scope` | `availableScope` | `String` | `""` |
| `pri_type` | `priType` | `Int` | `0` |
| `label_type_list` | `labelTypeList` | `List<Int>` | `emptyList()` |
| `sub_type` | `subType` | `Int` | `0` |
| `channel` | `channel` | `List<WorkUpdateSyncChannelDTO>` | `emptyList()` |
