import styles from "./Swatch.module.css";

/** Series color marker; dashed draws a short dashed line for comparison series */
export function Swatch({ color, dashed = false }: { color: string; dashed?: boolean | undefined }) {
  return <span className={dashed ? styles.dashed : styles.swatch} style={{ color }} aria-hidden="true" />;
}

/** Resource name with its series color in front */
export function SeriesName({ color, name }: { color: string; name: string }) {
  return (
    <span className={styles.name}>
      <Swatch color={color} />
      {name}
    </span>
  );
}
