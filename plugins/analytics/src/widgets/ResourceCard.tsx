import type { ReactNode } from "react";
import type { Resource } from "../data";
import styles from "./ResourceCard.module.css";
import { SeriesName } from "./Swatch";

export interface ResourceCardProps {
  resource: Resource;
  /** Line under the name, e.g. "冒险模组 · 2026-10" */
  caption?: string | undefined;
  metrics: { label: string; value: string }[];
  /** Makes the card a toggle button, e.g. to filter orders by this resource */
  selected?: boolean | undefined;
  onClick?: (() => void) | undefined;
}

/** One resource's numbers for a period; clickable when onClick is given */
export function ResourceCard({ resource, caption, metrics, selected = false, onClick }: ResourceCardProps) {
  const content: ReactNode = (
    <>
      <strong>
        <SeriesName color={resource.color} name={resource.name} />
      </strong>
      {caption && <span className={styles.caption}>{caption}</span>}
      <dl className={styles.metrics}>
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );

  if (!onClick) {
    return <div className={styles.card}>{content}</div>;
  }
  return (
    <button
      type="button"
      className={selected ? `${styles.card} ${styles.selected}` : styles.card}
      aria-pressed={selected}
      aria-label={`筛选${resource.name}的订单`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

/** Four-column grid that fills its panel; cards scroll inside when space runs out */
export function ResourceGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
