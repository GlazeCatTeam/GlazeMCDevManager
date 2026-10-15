import { useId, useState } from "react";
import { formatValue, type Metric, type TrendSeries } from "../mock";
import { InlineSelect } from "./InlineSelect";
import { Swatch } from "./Swatch";
import styles from "./TrendChart.module.css";

export interface ChartSeries extends Omit<TrendSeries, "values"> {
  /** null marks a day without data; the line breaks there */
  values: (number | null)[];
}

export interface TrendChartProps {
  labels: string[];
  series: ChartSeries[];
  metric: Metric;
  unit: string;
  kind?: "line" | "bar" | undefined;
}

// SVG drawing area in viewBox units
const CHART_WIDTH = 900;
const CHART_HEIGHT = 250;
const LEFT = 64;
const TOP = 16;
const PLOT_WIDTH = 816;
const PLOT_HEIGHT = 194;
const GRID_STEPS = [0, 1, 2, 3, 4];

/** Short axis tick, e.g. "1.2万"; exact values stay in the point tooltips */
function axisLabel(value: number): string {
  return value >= 10_000
    ? `${Math.round(value / 1000) / 10}万`
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

/** Round the largest value up to a tidy axis maximum; ratings always use 5 */
function axisCeiling(series: ChartSeries[], metric: Metric): number {
  if (metric === "rating") {
    return 5;
  }
  const maxValue = Math.max(1, ...series.flatMap((item) => item.values.filter((value) => value !== null)));
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  return Math.ceil(maxValue / magnitude / 0.5) * magnitude * 0.5;
}

/** SVG path of one line series, broken where values are missing */
function linePath(values: (number | null)[], xStep: number, ceiling: number): string {
  return values
    .map((value, index) => {
      if (value === null) {
        return "";
      }
      const command = index === 0 || values[index - 1] === null ? "M" : "L";
      return `${command}${LEFT + index * xStep},${TOP + PLOT_HEIGHT * (1 - value / ceiling)}`;
    })
    .join(" ");
}

/** Line or grouped bar chart of several resources; a date picker reads out exact values */
export function TrendChart({ labels, series, metric, unit, kind = "line" }: TrendChartProps) {
  const titleId = useId();
  const [activeDate, setActiveDate] = useState("");

  if (series.length === 0) {
    return <div className={styles.empty}>请选择至少一个资源，再查询数据</div>;
  }

  const ceiling = axisCeiling(series, metric);
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  const activeIndex = labels.indexOf(activeDate);
  const xStep = PLOT_WIDTH / Math.max(labels.length - 1, 1);
  const barGroupWidth = PLOT_WIDTH / Math.max(labels.length, 1);
  const xOf = (index: number) => (kind === "bar" ? LEFT + barGroupWidth * (index + 0.5) : LEFT + index * xStep);
  const yOf = (value: number) => TOP + PLOT_HEIGHT * (1 - value / ceiling);

  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>
          {`${unit}趋势：${labels[0]} 至 ${labels.at(-1)}，${series.map((item) => item.label).join("、")}`}
        </title>
        {GRID_STEPS.map((step) => {
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
            <text key={label} x={xOf(index)} y={CHART_HEIGHT - 12} textAnchor="middle" className={styles.axisLabel}>
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
                d={linePath(item.values, xStep, ceiling)}
              />
            )}
            {item.values.map((value, index) => {
              if (value === null) {
                return null;
              }
              const tooltip = `${labels[index]} · ${item.label}：${formatValue(value, metric)} ${unit}`;
              const selected = activeIndex === index;
              if (kind === "bar") {
                const barWidth = (barGroupWidth * 0.8) / series.length;
                return (
                  <rect
                    key={labels[index]}
                    x={LEFT + index * barGroupWidth + barGroupWidth * 0.1 + barWidth * seriesIndex}
                    y={yOf(value)}
                    width={Math.max(1, barWidth - 1)}
                    height={TOP + PLOT_HEIGHT - yOf(value)}
                    fill={item.color}
                    opacity={selected ? 1 : 0.8}
                  >
                    <title>{tooltip}</title>
                  </rect>
                );
              }
              return (
                <circle
                  key={labels[index]}
                  cx={xOf(index)}
                  cy={yOf(value)}
                  r={selected ? 5 : 4}
                  fill={item.color}
                  fillOpacity={selected ? 1 : 0}
                >
                  <title>{tooltip}</title>
                </circle>
              );
            })}
          </g>
        ))}
      </svg>
      <div className={styles.caption}>
        <span>单位：{unit}</span>
        <InlineSelect
          label="查看数值"
          value={activeIndex >= 0 ? activeDate : ""}
          options={[{ value: "", label: "选择日期" }, ...labels.map((label) => ({ value: label, label }))]}
          onChange={setActiveDate}
        />
      </div>
      <div className={styles.legend} aria-live="polite">
        {series.map((item) => {
          const value = activeIndex >= 0 ? item.values[activeIndex] : undefined;
          return (
            <span key={item.id} className={styles.legendItem}>
              <Swatch color={item.color} dashed={item.dashed} />
              {item.label}
              {value !== undefined && `：${value === null ? "未提供" : formatValue(value, metric)}`}
            </span>
          );
        })}
      </div>
    </div>
  );
}
