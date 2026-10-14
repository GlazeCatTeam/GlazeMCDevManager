import type { AvatarColors } from "@glaze/ui";

// Mock data for building the UI before the session manager exists (M2)

export interface MockAccount {
  uid: string;
  nickname: string;
  avatar: AvatarColors;
  sessionValid: boolean;
}

export const currentAccount: MockAccount = {
  uid: "123456789",
  nickname: "开发者A",
  avatar: { face: "#4FA3E8", hair: "#2E6FB0", eyes: "#13263D" },
  sessionValid: true,
};
