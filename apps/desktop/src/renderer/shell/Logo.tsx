/** Grass block app logo; brand artwork with fixed colors, not theme tokens */
export function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" fill="#8B5A2B" />
      <rect x="1" y="1" width="14" height="5" fill="#5DA130" />
      <rect x="3" y="6" width="2" height="1" fill="#5DA130" />
      <rect x="9" y="6" width="1" height="2" fill="#5DA130" />
      <rect x="13" y="6" width="1" height="1" fill="#5DA130" />
    </svg>
  );
}
