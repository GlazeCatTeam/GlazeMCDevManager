import type { AvatarColors } from "@glaze/plugin-sdk";

// Mock data for building the UI before the session manager exists (M2).
// Level fields follow the platform's level info response used by MCDevManager

export type LoginMethod = "email" | "cookie";

export interface SavedAccount {
  uid: string;
  nickname: string;
  email: string | null;
  loginMethod: LoginMethod;
  /** Display date of the last login, e.g. "10/12" */
  lastLoginAt: string;
  sessionValid: boolean;
  avatar: AvatarColors;
}

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
  email: "邮箱登录",
  cookie: "Cookie 登录",
};

export const accounts: SavedAccount[] = [
  {
    uid: "123456789",
    nickname: "开发者A",
    email: "dev@example.com",
    loginMethod: "email",
    lastLoginAt: "10/15",
    sessionValid: true,
    avatar: { face: "#4FA3E8", hair: "#2E6FB0", eyes: "#13263D" },
  },
  {
    uid: "223456781",
    nickname: "开发者B",
    email: null,
    loginMethod: "cookie",
    lastLoginAt: "10/12",
    sessionValid: true,
    avatar: { face: "#E8913A", hair: "#B5631C", eyes: "#3D1E06" },
  },
];

export const initialCurrentUid = "123456789";
export const initialVerifiedAt = "14:02";

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
