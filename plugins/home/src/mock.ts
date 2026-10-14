import type { AvatarColors } from "@glaze/plugin-sdk";

// Mock data for building the UI before the NetEase client exists (M2/M3).
// Field shapes follow the platform responses used by MCDevManager's home page

export interface HomeAccount {
  nickname: string;
  avatar: AvatarColors;
  level: number;
  levelName: string;
  exp: { floor: number; ceiling: number; total: number };
}

export interface Overview {
  thisMonthDiamond: number;
  lastMonthDiamond: number;
  thisMonthDownload: number;
  lastMonthDownload: number;
  yesterdayDiamond: number;
  days14AverageDiamond: number;
  yesterdayDownload: number;
  days14AverageDownload: number;
}

export interface ProfitEstimate {
  totalYuan: number;
  afterTaxYuan: number;
  diamondIncomeYuan: number;
  developerShareYuan: number;
  /** Works whose income query failed; the total is incomplete when this is non-zero */
  failedWorks: number;
}

export type RankChange = { kind: "up" | "down"; value: number } | { kind: "new" } | { kind: "flat" };

export interface RankItem {
  rank: number;
  title: string;
  change: RankChange;
  cover: AvatarColors;
}

export const rankCategories = [
  "手游热门飙升",
  "热搜榜",
  "手游免费榜",
  "手游畅销榜",
  "端游下载榜",
  "端游点赞榜",
] as const;
export const rankSubCategories = ["模组", "地图", "材质光影", "联机大厅"] as const;

export const account: HomeAccount = {
  nickname: "开发者A",
  avatar: { face: "#4FA3E8", hair: "#2E6FB0", eyes: "#13263D" },
  level: 12,
  levelName: "巧手工匠",
  exp: { floor: 0, ceiling: 3000, total: 2450 },
};

export const overview: Overview = {
  thisMonthDiamond: 186420,
  lastMonthDiamond: 241380,
  thisMonthDownload: 45210,
  lastMonthDownload: 58930,
  yesterdayDiamond: 12480,
  days14AverageDiamond: 11350,
  yesterdayDownload: 3216,
  days14AverageDownload: 2980,
};

export type ProfitMonth = "this" | "last";

export const profitMonthLabels: Record<ProfitMonth, string> = {
  this: "本月收益速算",
  last: "上月收益速算",
};

export const profits: Record<ProfitMonth, ProfitEstimate> = {
  this: { totalYuan: 8642.5, afterTaxYuan: 7259.7, diamondIncomeYuan: 10880, developerShareYuan: 6120, failedWorks: 0 },
  last: {
    totalYuan: 10236.8,
    afterTaxYuan: 8598.91,
    diamondIncomeYuan: 12904,
    developerShareYuan: 7248,
    failedWorks: 0,
  },
};

const titles = [
  "空岛生存",
  "像素家具包",
  "方块赛车",
  "末地探险者",
  "温馨农场",
  "机械动力扩展",
  "海底王国",
  "恐龙世界",
  "中式建筑包",
  "光影：晴空",
];
const fallbackCover: AvatarColors = { face: "#3A3B3D", hair: "#77797C", eyes: "#B9BABC" };
const covers: AvatarColors[] = [
  { face: "#8B5A2B", hair: "#5DA130", eyes: "#3E2A14" },
  { face: "#B5631C", hair: "#E8913A", eyes: "#FFE0B8" },
  { face: "#7E1E1E", hair: "#C33636", eyes: "#FFD43B" },
  { face: "#5E36A0", hair: "#8D5CD6", eyes: "#E9DDFF" },
  { face: "#3C8527", hair: "#7FD65C", eyes: "#FFF6C8" },
  { face: "#3A3B3D", hair: "#77797C", eyes: "#FFC44D" },
  { face: "#2E6FB0", hair: "#4FA3E8", eyes: "#D6F0FF" },
  { face: "#3D6E34", hair: "#6BAF5F", eyes: "#F2F2F2" },
  { face: "#8A5A2B", hair: "#D9A066", eyes: "#C33636" },
  { face: "#2E8FB0", hair: "#5FC8E8", eyes: "#FFFFFF" },
];
const changes: RankChange[] = [
  { kind: "up", value: 2 },
  { kind: "down", value: 1 },
  { kind: "new" },
  { kind: "flat" },
  { kind: "up", value: 5 },
  { kind: "down", value: 3 },
  { kind: "up", value: 1 },
  { kind: "flat" },
];

/** Deterministic fake ranking so every category and sub-category shows a different list */
export function mockRanking(category: number, subCategory: number): RankItem[] {
  const shift = (category * 3 + subCategory * 2) % titles.length;
  return Array.from({ length: 8 }, (_, i) => ({
    rank: i + 1,
    title: titles[(i + shift) % titles.length] ?? "",
    change: changes[(i + shift) % changes.length] ?? { kind: "flat" },
    cover: covers[(i + shift) % covers.length] ?? fallbackCover,
  }));
}
