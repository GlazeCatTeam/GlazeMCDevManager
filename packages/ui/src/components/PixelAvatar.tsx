import styles from "./PixelAvatar.module.css";

/** Identity colors of a generated avatar; these are account data, not theme tokens */
export interface AvatarColors {
  face: string;
  hair: string;
  eyes: string;
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
