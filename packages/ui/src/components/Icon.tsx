import { type IconName, pixelIcons } from "../icons/pixel-icons";

export interface IconProps {
  name: IconName;
  /** Rendered size in px; defaults to the icon's grid size */
  size?: number | undefined;
  className?: string | undefined;
}

const pathCache = new Map<IconName, string>();

/** Turn a pixel grid into one SVG path made of horizontal runs */
function gridToPath(rows: readonly string[]): string {
  const parts: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "#") {
        x += 1;
        continue;
      }
      const start = x;
      while (row[x] === "#") {
        x += 1;
      }
      parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join("");
}

/** Monochrome pixel icon that inherits the current text color */
export function Icon({ name, size, className }: IconProps) {
  const rows = pixelIcons[name];
  let path = pathCache.get(name);
  if (path === undefined) {
    path = gridToPath(rows);
    pathCache.set(name, path);
  }
  const grid = rows.length;
  return (
    <svg
      className={className}
      width={size ?? grid}
      height={size ?? grid}
      viewBox={`0 0 ${grid} ${grid}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
