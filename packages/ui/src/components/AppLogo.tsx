/** Grass block app logo; brand artwork with fixed colors, not theme tokens. Larger sizes get extra texture */
export function AppLogo({ size }: { size: number }) {
  const detailed = size >= 32;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" fill="#8B5A2B" />
      <rect x="1" y="1" width="14" height="5" fill="#5DA130" />
      <rect x="3" y="6" width="2" height="1" fill="#5DA130" />
      <rect x="9" y="6" width="1" height="2" fill="#5DA130" />
      <rect x="13" y="6" width="1" height="1" fill="#5DA130" />
      {detailed && (
        <>
          <rect x="5" y="10" width="1" height="1" fill="#6B4320" />
          <rect x="11" y="12" width="1" height="1" fill="#6B4320" />
          <rect x="2" y="2" width="3" height="1" fill="#7BC24A" />
        </>
      )}
    </svg>
  );
}
