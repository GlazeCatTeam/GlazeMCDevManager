export interface DeveloperReply {
  content: string;
  createdAt: string;
}

export interface CommunityEntry {
  id: string;
  nickname: string;
  uid: string;
  work: string;
  content: string;
  createdAt: string;
  canReply: boolean;
  reply?: DeveloperReply;
  blockedReason?: string;
}

export const feedbackTypes = ["故障问题", "玩法建议", "性能反馈", "组件冲突", "内容侵权", "我的山头", "其他"] as const;
export type FeedbackType = (typeof feedbackTypes)[number];
export type ReplyFilter = "全部" | "未回复" | "已回复";

export interface FeedbackImage {
  name: string;
  color: string;
}

export interface FeedbackLog {
  name: string;
  content: string;
}

export interface PlayerFeedback extends CommunityEntry {
  type: FeedbackType;
  images: FeedbackImage[];
  log?: FeedbackLog;
  conflicts: string[];
}

export interface PlayerComment extends CommunityEntry {
  stars: number;
  tag: string;
}

export const mockToday = "2026-10-15";
export const MAX_REPLY_LENGTH = 500;
export const commentTags = ["生存", "冒险", "资源", "建筑", "工具", "趣味"] as const;
export const dateRanges = ["今天", "近 7 天", "近 30 天", "近 90 天", "全部"] as const;
export type DateRange = (typeof dateRanges)[number];

export const feedback: PlayerFeedback[] = [
  {
    id: "feedback-1",
    nickname: "方块小熊",
    uid: "103218994",
    work: "空岛奇境",
    type: "故障问题",
    content:
      "更新 2.3 之后，第二个空岛上的传送门打不开了。点了没反应，重新存档也一样。手机型号是小米 14，游戏版本是 3.1。",
    createdAt: "2026-10-15 14:20",
    canReply: true,
    images: [
      { name: "传送门位置.png", color: "var(--g-chart-series-2)" },
      { name: "存档界面.png", color: "var(--g-chart-series-1)" },
    ],
    log: {
      name: "feedback_log.txt",
      content:
        "[本地模拟日志]\n2026-10-15 14:18:03 INFO Loading world: 空岛奇境\n2026-10-15 14:18:06 INFO Component version: 2.3.0\n2026-10-15 14:19:12 WARN Portal target is unavailable\n2026-10-15 14:20:00 INFO Feedback attachment created",
    },
    conflicts: [],
  },
  {
    id: "feedback-2",
    nickname: "能量下的方块喵",
    uid: "105832716",
    work: "田园物语",
    type: "玩法建议",
    content: "能不能增加一些雨天事件？现在的农场特别好玩，如果下雨的时候能遇见稀有小动物就更好了！",
    createdAt: "2026-10-15 11:08",
    canReply: false,
    reply: { content: "谢谢你的建议！天气事件已经加入后续版本的计划。", createdAt: "2026-10-15 11:30" },
    images: [],
    conflicts: [],
  },
  {
    id: "feedback-3",
    nickname: "Steve_2026",
    uid: "108650321",
    work: "空岛奇境",
    type: "性能反馈",
    content: "进入最后一个岛的时候，帧率掉得比较明显。希望可以增加一个低配模式，减少粒子效果。",
    createdAt: "2026-10-14 20:37",
    canReply: true,
    images: [],
    conflicts: [],
  },
  {
    id: "feedback-4",
    nickname: "森林大开发家",
    uid: "102986432",
    work: "森林冒险",
    type: "组件冲突",
    content: "这个地图和高清光影一起用的时候人物模型会闪烁，只启用其中一个组件就没有这个问题。",
    createdAt: "2026-10-14 15:16",
    canReply: true,
    images: [],
    conflicts: ["高清光影 1.8", "人物动作扩展 2.0"],
  },
  {
    id: "feedback-5",
    nickname: "红石梦想家",
    uid: "102112083",
    work: "红石工坊",
    type: "其他",
    content: "很喜欢新加的教学关卡，终于学会了活塞门，希望后面还能有更多教程。",
    createdAt: "2026-10-13 19:48",
    canReply: false,
    reply: { content: "谢谢支持！下一期会加入自动农场的教学。", createdAt: "2026-10-14 09:05" },
    images: [],
    conflicts: [],
  },
  {
    id: "feedback-6",
    nickname: "像素旅人",
    uid: "104678910",
    work: "像素家具",
    type: "内容侵权",
    content: "发现其他作品使用了相似的家具贴图，已经提交相关材料，请核实。",
    createdAt: "2026-10-12 16:12",
    canReply: false,
    blockedReason: "这条反馈由平台处理，暂不支持开发者直接回复。",
    images: [],
    conflicts: [],
  },
  {
    id: "feedback-7",
    nickname: "山间小筑",
    uid: "106102438",
    work: "田园物语",
    type: "我的山头",
    content: "我的山头里新建的花园已经完成啦，想分享一下，也想知道以后能不能扩建小屋。",
    createdAt: "2026-10-11 10:30",
    canReply: true,
    images: [],
    conflicts: [],
  },
];

export const comments: PlayerComment[] = [
  {
    id: "comment-1",
    nickname: "麦芽与晚风",
    uid: "108230781",
    work: "空岛奇境",
    stars: 5,
    tag: "冒险",
    content: "玩了一下午停不下来，空岛的探索做得特别用心，每次登上新岛都有惊喜！",
    createdAt: "2026-10-15 14:42",
    canReply: true,
  },
  {
    id: "comment-2",
    nickname: "方块漫游者",
    uid: "108398456",
    work: "森林冒险",
    stars: 4,
    tag: "生存",
    content: "地图的氛围很棒，就是前期资源稍微少了一点，期待之后的更新。",
    createdAt: "2026-10-15 09:10",
    canReply: true,
  },
  {
    id: "comment-3",
    nickname: "不想挖矿的矿工",
    uid: "108668321",
    work: "便捷工具箱",
    stars: 2,
    tag: "工具",
    content: "一键整理的功能很好用，但是偶尔会把快捷栏里的物品也收走，希望能修复。",
    createdAt: "2026-10-14 21:33",
    canReply: false,
    reply: { content: "问题已经复现，下一次更新会保留快捷栏里的物品。谢谢反馈！", createdAt: "2026-10-15 08:30" },
  },
  {
    id: "comment-4",
    nickname: "小方糖",
    uid: "105901283",
    work: "像素家具",
    stars: 5,
    tag: "建筑",
    content: "这套家具太可爱了，小屋终于有家的感觉了，想要更多厨房家具！",
    createdAt: "2026-10-12 18:25",
    canReply: true,
  },
  {
    id: "comment-5",
    nickname: "冒险收藏家",
    uid: "103045176",
    work: "欢乐派对",
    stars: 3,
    tag: "趣味",
    content: "和朋友一起玩很开心，不过小游戏有些少，再丰富一点就更好了。",
    createdAt: "2026-09-28 13:27",
    canReply: true,
  },
  {
    id: "comment-6",
    nickname: "云端像素",
    uid: "101782365",
    work: "高清资源包",
    stars: 1,
    tag: "资源",
    content: "我的设备无法正常加载资源包。",
    createdAt: "2026-08-20 16:08",
    canReply: false,
    blockedReason: "该评论已超过可回复期限。",
  },
];

/** Match a local entry by player, content or component name */
export function matchesSearch(entry: CommunityEntry, search: string): boolean {
  const query = search.trim().toLocaleLowerCase();
  return [entry.nickname, entry.uid, entry.content, entry.work].some((value) =>
    value.toLocaleLowerCase().includes(query),
  );
}

/** Filter feedback without changing the stored demo entries */
export function filterFeedback(
  entries: PlayerFeedback[],
  search: string,
  type: FeedbackType | "全部",
  reply: ReplyFilter,
): PlayerFeedback[] {
  return entries.filter(
    (entry) =>
      matchesSearch(entry, search) &&
      (type === "全部" || entry.type === type) &&
      (reply === "全部" || Boolean(entry.reply) === (reply === "已回复")),
  );
}

/** Filter comments against the demo date so relative date controls remain reproducible */
export function filterComments(
  entries: PlayerComment[],
  search: string,
  range: DateRange,
  stars: number[],
  tag: string,
): PlayerComment[] {
  const days: Record<DateRange, number> = {
    今天: 1,
    "近 7 天": 7,
    "近 30 天": 30,
    "近 90 天": 90,
    全部: Number.POSITIVE_INFINITY,
  };
  const today = Date.parse(`${mockToday}T00:00:00+08:00`);
  return entries.filter((entry) => {
    const age = (today - Date.parse(`${entry.createdAt.slice(0, 10)}T00:00:00+08:00`)) / 86400000;
    return (
      matchesSearch(entry, search) &&
      age >= 0 &&
      age < days[range] &&
      (stars.length === 0 || stars.includes(entry.stars)) &&
      (tag === "全部" || entry.tag === tag)
    );
  });
}

/** Record a local demo reply, leaving blocked or already answered entries unchanged */
export function replyToEntry<T extends CommunityEntry>(entries: T[], id: string, content: string): T[] {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > MAX_REPLY_LENGTH) {
    return entries;
  }
  return entries.map((entry) =>
    entry.id === id && entry.canReply && !entry.reply
      ? { ...entry, canReply: false, reply: { content: trimmed, createdAt: "刚刚 · 本地模拟" } }
      : entry,
  );
}
