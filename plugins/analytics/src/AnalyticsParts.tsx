import { Button } from "@glaze/plugin-sdk";
import { useId, useState } from "react";
import styles from "./AnalyticsPage.module.css";
import { formatValue, type Metric, type TrendSeries } from "./mock";

interface ChoiceProps<T extends string | number> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Compact, accessible single-choice filters in the existing Ore button style */
export function Choices<T extends string | number>({ label, options, value, onChange }: ChoiceProps<T>) {
  return (
    <fieldset className={styles.choiceGroup} aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          size="xs"
          variant={value === option.value ? "primary" : "secondary"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}

interface StatItem {
  label: string;
  value: string;
  note: string;
}

/** Fixed-height metric cells aligned with the home overview strip */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className={styles.stats}>
      {items.map((item) => (
        <div className={styles.stat} key={item.label}>
          <span className={styles.muted}>{item.label}</span>
          <strong className={styles.statValue}>{item.value}</strong>
          <span className={styles.statNote}>{item.note}</span>
        </div>
      ))}
    </div>
  );
}

interface ChartProps {
  labels: string[];
  series: (Omit<TrendSeries, "values"> & { values: (number | null)[] })[];
  metric: Metric;
  unit: string;
  kind?: "line" | "bar";
}

const CHART_WIDTH = 900;
const CHART_HEIGHT = 250;
const LEFT = 64;
const TOP = 16;
const PLOT_WIDTH = 816;
const PLOT_HEIGHT = 194;

/** Format large axis ticks while retaining precise values in point tooltips */
function axisLabel(value: number): string {
  return value >= 10_000
    ? `${Math.round(value / 1000) / 10}万`
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

/** Draw shared resource charts with hover and keyboard-readable daily values */
export function TrendChart({ labels, series, metric, unit, kind = "line" }: ChartProps) {
  const titleId = useId();
  const [activeDate, setActiveDate] = useState("");
  const maxValue = Math.max(
    1,
    ...series.flatMap((item) => item.values.filter((value): value is number => value !== null)),
  );
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const ceiling = metric === "rating" ? 5 : Math.ceil(maxValue / magnitude / 0.5) * magnitude * 0.5;
  const steps = [0, 1, 2, 3, 4];
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  const activeIndex = labels.indexOf(activeDate);
  const xStep = PLOT_WIDTH / Math.max(labels.length - 1, 1);
  const barGroupWidth = PLOT_WIDTH / Math.max(labels.length, 1);

  if (series.length === 0) {
    return <div className={styles.chartEmpty}>请选择至少一个资源，再查询数据</div>;
  }

  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-labelledby={titleId}>
        <title
          id={titleId}
        >{`${unit}趋势：${labels[0]} 至 ${labels.at(-1)}，${series.map((item) => item.label).join("、")}`}</title>
        {steps.map((step) => {
          const y = TOP + PLOT_HEIGHT - (step / 4) * PLOT_HEIGHT;
          return (
            <g key={step}>
              <line x1={LEFT} x2={LEFT + PLOT_WIDTH} y1={y} y2={y} className={styles.gridLine} />
              <text x={LEFT - 12} y={y + 4} textAnchor="end" className={styles.axisLabel}>
                {axisLabel((step / 4) * ceiling)}
              </text>
            </g>
          );
        })}
        {labels.map((label, index) =>
          index % labelStep === 0 || index === labels.length - 1 ? (
            <text
              key={label}
              x={kind === "bar" ? LEFT + barGroupWidth * (index + 0.5) : LEFT + index * xStep}
              y={CHART_HEIGHT - 12}
              textAnchor="middle"
              className={styles.axisLabel}
            >
              {label.slice(5).replace("-", "/")}
            </text>
          ) : null,
        )}
        {series.map((item, seriesIndex) => (
          <g key={item.id}>
            {kind === "line" && (
              <path
                fill="none"
                stroke={item.color}
                strokeWidth={2.5}
                strokeDasharray={item.dashed ? "6 5" : undefined}
                d={item.values
                  .map((value, index) =>
                    value == null
                      ? ""
                      : `${index === 0 || item.values[index - 1] == null ? "M" : "L"}${LEFT + index * xStep},${TOP + PLOT_HEIGHT * (1 - value / ceiling)}`,
                  )
                  .join(" ")}
              />
            )}
            {item.values.map((value, index) => {
              if (value == null) return null;
              const label = `${labels[index]} · ${item.label}：${formatValue(value, metric)} ${unit}`;
              const y = TOP + PLOT_HEIGHT * (1 - value / ceiling);
              const selected = activeIndex === index;
              return kind === "bar" ? (
                <rect
                  key={labels[index]}
                  x={
                    LEFT +
                    index * barGroupWidth +
                    barGroupWidth * 0.1 +
                    (barGroupWidth * 0.8 * seriesIndex) / series.length
                  }
                  y={y}
                  width={Math.max(1, (barGroupWidth * 0.8) / series.length - 1)}
                  height={TOP + PLOT_HEIGHT - y}
                  fill={item.color}
                  opacity={selected ? 1 : 0.8}
                >
                  <title>{label}</title>
                </rect>
              ) : (
                <circle
                  key={labels[index]}
                  cx={LEFT + index * xStep}
                  cy={y}
                  r={selected ? 5 : 4}
                  fill={item.color}
                  fillOpacity={selected ? 1 : 0}
                >
                  <title>{label}</title>
                </circle>
              );
            })}
          </g>
        ))}
      </svg>
      <div className={styles.chartCaption}>
        <span>单位：{unit}</span>
        <label className={styles.inlineLabel}>
          查看数值
          <select
            className={`${styles.select} ${styles.chartDate}`}
            value={activeIndex >= 0 ? activeDate : ""}
            onChange={(event) => setActiveDate(event.target.value)}
          >
            <option value="">选择日期</option>
            {labels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.legend} aria-live="polite">
        {series.map((item) => (
          <span key={item.id} className={styles.legendItem}>
            <span className={item.dashed ? styles.dashedSwatch : styles.swatch} style={{ color: item.color }} />
            {item.label}
            {activeIndex >= 0
              ? `：${item.values[activeIndex] == null ? "未提供" : formatValue(item.values[activeIndex], metric)}`
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
