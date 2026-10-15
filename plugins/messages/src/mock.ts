// Local fixtures for the message preview; no platform requests are sent
export const messageTypes = ["系统通知", "重要通知", "审核通知", "问题反馈", "提醒"] as const;
export type MessageType = (typeof messageTypes)[number];
export type ReadFilter = "全部" | "未读" | "已读";

export interface Message {
  id: string;
  type: MessageType;
  title: string;
  sender: string;
  sentAt: string;
  body: string[];
  info: { label: string; value: string }[];
  read: boolean;
}

const fixtures: Message[] = [
  {
    id: "notice-01",
    type: "重要通知",
    title: "《安全生存》2.3 版本审核通过",
    sender: "网易我的世界开发者平台",
    sentAt: "10/15 14:32",
    body: [
      "你好，开发者：",
      "你提交的《安全生存》2.3 版本已通过审核。你可以前往作品管理查看作品状态，并安排后续上架计划。",
      "感谢你为玩家带来新的内容，期待你的更多精彩作品！",
    ],
    info: [
      { label: "所属作品", value: "安全生存" },
      { label: "版本", value: "2.3.0" },
      { label: "审核结果", value: "审核通过" },
    ],
    read: false,
  },
  {
    id: "notice-02",
    type: "审核通知",
    title: "关于 11 月作品推荐位申请的通知",
    sender: "平台运营团队",
    sentAt: "10/15 13:58",
    body: ["11 月作品推荐位申请现已开放。请在开发者平台查看本期活动说明，并按要求提交作品信息。"],
    info: [{ label: "申请截止", value: "2026-10-28" }],
    read: false,
  },
  {
    id: "notice-03",
    type: "问题反馈",
    title: "《背包扩展》有新的玩家反馈",
    sender: "玩家反馈中心",
    sentAt: "10/15 12:10",
    body: ["有玩家反馈了多人联机时背包显示异常的问题。请前往玩家反馈查看详情与附件。"],
    info: [{ label: "所属作品", value: "背包扩展" }],
    read: false,
  },
  {
    id: "notice-04",
    type: "系统通知",
    title: "开发者平台 10 月 18 日维护通知",
    sender: "网易我的世界开发者平台",
    sentAt: "10/15 09:00",
    body: ["开发者平台计划于 10 月 18 日 02:00–05:00 进行系统维护。维护期间部分查询可能暂不可用，请合理安排作品发布。"],
    info: [],
    read: false,
  },
  {
    id: "notice-05",
    type: "重要通知",
    title: "《冒险地图》1.4 版本审核未通过",
    sender: "作品审核团队",
    sentAt: "10/14 18:26",
    body: ["本次版本未通过审核，请核对下方审核意见，修改后重新提交。"],
    info: [
      { label: "所属作品", value: "冒险地图" },
      { label: "审核意见", value: "作品详情页截图与当前版本内容不一致，请更新截图。" },
    ],
    read: false,
  },
  {
    id: "notice-06",
    type: "提醒",
    title: "《像素装饰》限时折扣将于明日结束",
    sender: "活动助手",
    sentAt: "10/14 16:00",
    body: ["你设置的限时折扣将于 10 月 16 日结束，结束后作品恢复原价。"],
    info: [{ label: "所属作品", value: "像素装饰" }],
    read: true,
  },
  {
    id: "notice-07",
    type: "系统通知",
    title: "《建筑工具箱》更新成功",
    sender: "网易我的世界开发者平台",
    sentAt: "10/14 11:30",
    body: ["你的作品更新已完成，玩家可下载最新版本。"],
    info: [{ label: "版本", value: "1.8.2" }],
    read: true,
  },
  {
    id: "notice-08",
    type: "审核通知",
    title: "《森林小屋》新版本已进入审核",
    sender: "作品审核团队",
    sentAt: "10/13 17:08",
    body: ["作品已提交审核，审核结果会通过消息中心通知。"],
    info: [],
    read: false,
  },
  {
    id: "notice-09",
    type: "提醒",
    title: "本月作品数据已更新",
    sender: "数据助手",
    sentAt: "10/13 10:12",
    body: ["本月作品数据已更新，可前往数据分析查看资源表现。"],
    info: [],
    read: true,
  },
  {
    id: "notice-10",
    type: "问题反馈",
    title: "《安全生存》收到新的玩法建议",
    sender: "玩家反馈中心",
    sentAt: "10/12 20:44",
    body: ["玩家提交了一条玩法建议，请前往玩家反馈查看并回复。"],
    info: [],
    read: false,
  },
  {
    id: "notice-11",
    type: "系统通知",
    title: "开发者资料已更新",
    sender: "账号服务",
    sentAt: "10/12 09:10",
    body: ["你的开发者公开资料已完成更新。"],
    info: [],
    read: true,
  },
  {
    id: "notice-12",
    type: "提醒",
    title: "欢迎使用开发者消息中心",
    sender: "平台运营团队",
    sentAt: "10/11 10:00",
    body: ["在这里查看系统通知、审核进度与玩家反馈提醒。"],
    info: [],
    read: true,
  },
];

/** Copy the fixtures and mark the initially opened detail as read */
export function createMessages(): Message[] {
  return fixtures.map((message, index) => ({ ...message, read: index === 0 || message.read }));
}

/** Filter a message snapshot without mutating its read state */
export function filterMessages(messages: Message[], query: string, type: MessageType | "全部", status: ReadFilter) {
  const term = query.trim().toLocaleLowerCase();
  return messages.filter(
    (message) =>
      message.title.toLocaleLowerCase().includes(term) &&
      (type === "全部" || message.type === type) &&
      (status === "全部" || message.read === (status === "已读")),
  );
}

/** Mark explicitly selected messages as read in the local snapshot */
export function markMessagesRead(messages: Message[], ids: string[]): Message[] {
  return messages.map((message) => (ids.includes(message.id) ? { ...message, read: true } : message));
}

/** Remove explicitly confirmed messages from the local snapshot */
export function deleteMessages(messages: Message[], ids: string[]): Message[] {
  return messages.filter((message) => !ids.includes(message.id));
}
