import type { LoginMethod } from "@glaze/plugin-sdk";

// Level and settings are still mock data; accounts come from the session manager.
// Level fields follow the platform's level info response used by MCDevManager

export interface Contribution {
  title: string;
  score: number;
  rank: number;
  grade: string;
}

export interface LevelInfo {
  level: number;
  levelName: string;
  exp: { floor: number; ceiling: number; total: number };
  /** Whether the task for moving up to the next class is done */
  upgradeClassAchieve: boolean;
  contributions: Contribution[];
}

export const loginMethodLabels: Record<LoginMethod, string> = {
  window: "网易账号登录",
  cookie: "Cookie 登录",
};

export const levelInfo: LevelInfo = {
  level: 12,
  levelName: "巧手工匠",
  exp: { floor: 0, ceiling: 3000, total: 2450 },
  upgradeClassAchieve: false,
  contributions: [
    { title: "组件贡献", score: 1280, rank: 128, grade: "A" },
    { title: "网络游戏", score: 860, rank: 256, grade: "B" },
  ],
};

/** Plugin settings declared in glaze-plugin.json; read from the settings store later */
export const initialSettings = {
  autoLogin: true,
  notifyOnExpire: true,
};
