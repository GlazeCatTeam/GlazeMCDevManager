import type { AvatarColors } from "@glaze/ui";

// Mock data for building the UI before the session manager exists (M2)

export interface MockAccount {
  uid: string;
  nickname: string;
  avatar: AvatarColors;
  sessionValid: boolean;
}

/**
 * First page after launch. null opens the workbench; set it to preview the startup screens, e.g.
 * { route: "glaze.account/login", params: {} } or { route: "glaze.account/login-expired", params: { uid: "123456789" } }
 */
export const startup: { route: string; params: Record<string, string> } | null = null;

export const currentAccount: MockAccount = {
  uid: "123456789",
  nickname: "开发者A",
  avatar: { face: "#4FA3E8", hair: "#2E6FB0", eyes: "#13263D" },
  sessionValid: true,
};
