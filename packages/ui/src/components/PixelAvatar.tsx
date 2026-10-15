import styles from "./PixelAvatar.module.css";

/** Identity colors of a generated avatar; these are account data, not theme tokens */
export interface AvatarColors {
  face: string;
  hair: string;
  eyes: string;
}

// Identity palettes for generated avatars; account data, not theme tokens
const defaultPalette: AvatarColors = { face: "#4FA3E8", hair: "#2E6FB0", eyes: "#13263D" };
const palettes: AvatarColors[] = [
  defaultPalette,
  { face: "#E8913A", hair: "#B5631C", eyes: "#3D1E06" },
  { face: "#5DC137", hair: "#3C8527", eyes: "#14320C" },
  { face: "#B292DF", hair: "#7955AF", eyes: "#2A1A40" },
  { face: "#F07A7A", hair: "#C33636", eyes: "#3D0F0F" },
  { face: "#FFD43B", hair: "#D99A1E", eyes: "#3D2C06" },
];

/** Stable avatar colors for an account, derived from its id */
export function avatarColorsFor(seed: string): AvatarColors {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return palettes[hash % palettes.length] ?? defaultPalette;
}

export interface PixelAvatarProps {
  colors: AvatarColors;
  size: number;
}

/** 8x8 block-style face used for accounts without a custom avatar */
export function PixelAvatar({ colors, size }: PixelAvatarProps) {
  return (
    <svg
      className={styles.avatar}
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect width="8" height="8" fill={colors.face} />
      <rect width="8" height="2" fill={colors.hair} />
      <rect x="2" y="4" width="1" height="1" fill={colors.eyes} />
      <rect x="5" y="4" width="1" height="1" fill={colors.eyes} />
    </svg>
  );
}
