import type { AvatarColors } from "@glaze/plugin-sdk";
import type { WorkStatus } from "./status";

// Mock data for building the UI before the NetEase client exists (M3).
// Fields follow the platform's resource list response used by MCDevManager

export type PriceType = "diamond" | "point" | "free";

export interface Work {
  itemId: string;
  itemName: string;
  status: WorkStatus;
  price: number;
  priceType: PriceType;
  isOriginal: boolean;
  /** Published to both PE and PC */
  syncPcFlag: boolean;
  weakOffline: boolean;
  createTime: string;
  onlineTime: string | null;
  cover: AvatarColors;
}

/** Cover colors until real cover images load: face = body, hair = top band */
const cover = (hair: string, face: string): AvatarColors => ({ face, hair, eyes: face });

export const works: Work[] = [
  {
    itemId: "4668001",
    itemName: "空岛生存",
    status: "online",
    price: 300,
    priceType: "diamond",
    isOriginal: true,
    syncPcFlag: true,
    weakOffline: false,
    createTime: "2026-03-02",
    onlineTime: "2026-03-15",
    cover: cover("#5DA130", "#8B5A2B"),
  },
  {
    itemId: "4668002",
    itemName: "像素家具包",
    status: "reviewing",
    price: 600,
    priceType: "diamond",
    isOriginal: true,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2026-09-28",
    onlineTime: null,
    cover: cover("#E8913A", "#B5631C"),
  },
  {
    itemId: "4668003",
    itemName: "方块赛车",
    status: "reject",
    price: 300,
    priceType: "diamond",
    isOriginal: false,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2026-10-08",
    onlineTime: null,
    cover: cover("#C33636", "#7E1E1E"),
  },
  {
    itemId: "4668004",
    itemName: "末地探险者",
    status: "online",
    price: 0,
    priceType: "free",
    isOriginal: true,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2026-01-11",
    onlineTime: "2026-01-20",
    cover: cover("#8D5CD6", "#5E36A0"),
  },
  {
    itemId: "4668005",
    itemName: "温馨农场",
    status: "accept",
    price: 1000,
    priceType: "diamond",
    isOriginal: true,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2026-10-02",
    onlineTime: null,
    cover: cover("#7FD65C", "#3C8527"),
  },
  {
    itemId: "4668006",
    itemName: "机械动力扩展",
    status: "init",
    price: 2000,
    priceType: "diamond",
    isOriginal: false,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2026-10-12",
    onlineTime: null,
    cover: cover("#77797C", "#3A3B3D"),
  },
  {
    itemId: "4668007",
    itemName: "海底王国",
    status: "online",
    price: 600,
    priceType: "diamond",
    isOriginal: true,
    syncPcFlag: true,
    weakOffline: true,
    createTime: "2025-11-05",
    onlineTime: "2025-11-20",
    cover: cover("#4FA3E8", "#2E6FB0"),
  },
  {
    itemId: "4668008",
    itemName: "恐龙世界",
    status: "self_test",
    price: 300,
    priceType: "diamond",
    isOriginal: false,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2026-10-10",
    onlineTime: null,
    cover: cover("#6BAF5F", "#3D6E34"),
  },
  {
    itemId: "4668009",
    itemName: "中式建筑包",
    status: "offline",
    price: 0,
    priceType: "free",
    isOriginal: false,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2025-06-18",
    onlineTime: "2025-07-01",
    cover: cover("#D9A066", "#8A5A2B"),
  },
  {
    itemId: "4668010",
    itemName: "光影：晴空",
    status: "online",
    price: 300,
    priceType: "diamond",
    isOriginal: true,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2025-08-03",
    onlineTime: "2025-08-16",
    cover: cover("#5FC8E8", "#2E8FB0"),
  },
  {
    itemId: "4668011",
    itemName: "僵尸围城",
    status: "online",
    price: 600,
    priceType: "diamond",
    isOriginal: false,
    syncPcFlag: true,
    weakOffline: false,
    createTime: "2025-04-21",
    onlineTime: "2025-05-02",
    cover: cover("#6BAF5F", "#2F4F2A"),
  },
  {
    itemId: "4668012",
    itemName: "红石教学地图",
    status: "online",
    price: 0,
    priceType: "free",
    isOriginal: true,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2025-02-14",
    onlineTime: "2025-02-28",
    cover: cover("#C33636", "#55575A"),
  },
  {
    itemId: "4668013",
    itemName: "雪山小屋",
    status: "reject",
    price: 300,
    priceType: "diamond",
    isOriginal: false,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2026-10-05",
    onlineTime: null,
    cover: cover("#F2F2F2", "#77797C"),
  },
  {
    itemId: "4668014",
    itemName: "天空之城",
    status: "init",
    price: 1000,
    priceType: "diamond",
    isOriginal: true,
    syncPcFlag: false,
    weakOffline: false,
    createTime: "2026-10-13",
    onlineTime: null,
    cover: cover("#4FA3E8", "#E8E8E8"),
  },
];
