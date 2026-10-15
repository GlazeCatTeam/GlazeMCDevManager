import styles from "./CommentRating.module.css";

// Pixel colors of the drumstick artwork, from top-left to bottom-right; artwork keeps fixed colors like AppLogo
const drumstickParts = [
  { d: "M6 4V3H5V2H3v2z", fill: "#b88458" },
  { d: "M2 4v1h1v1h1V4z", fill: "#613c1b" },
  { d: "M6 6h1v1H6z", fill: "#e2d5aa" },
  { d: "M7 7h1v1H7z", fill: "#fff7dc" },
  { d: "M1 4h2V3h1V1H2v1H1z", fill: "#d42a2a" },
  { d: "M3 4v1h1v1h2V4z", fill: "#7b512d" },
  { d: "M1 3h1v1H1zm2-2h1v1H3z", fill: "#b21818" },
  { d: "M4 5h2V4H5V3H4z", fill: "#9d6d43" },
  { d: "M2 2h1v1H2z", fill: "#dfb18f" },
];

/** Hunger-bar drumstick used as the rating unit; an empty one shows only the outline */
export function DrumstickIcon({ empty = false }: { empty?: boolean }) {
  return (
    <svg
      className={styles.drumstick}
      viewBox="0 0 9 9"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <path
        d="M2 0v1H1v1H0v2h1v1h1v1h1v1h3v2h2V8h1V6H7V3H6V2H5V1H4V0z"
        fill={empty ? "var(--g-text-placeholder)" : "#000"}
      />
      {drumstickParts.map((part) => (
        <path key={part.d} d={part.d} fill={empty ? "var(--g-surface-sunken)" : part.fill} />
      ))}
    </svg>
  );
}

/** Five drumsticks with a textual rating for screen readers */
export function CommentRating({ value }: { value: number }) {
  return (
    <span className={styles.rating} role="img" aria-label={`${value} 分，满分 5 分`}>
      {[1, 2, 3, 4, 5].map((score) => (
        <DrumstickIcon key={score} empty={score > value} />
      ))}
    </span>
  );
}
