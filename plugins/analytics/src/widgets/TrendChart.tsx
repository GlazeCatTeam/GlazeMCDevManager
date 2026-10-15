import { type KeyboardEvent, type PointerEvent, useId, useState } from "react";
import { formatValue, type Metric, type TrendSeries } from "../data";
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

/** Round the largest value up to a tidy axis maximum */
function axisCeiling(series: ChartSeries[], metric: Metric): number {
  const maxValue = series.reduce(
    (maximum, item) => item.values.reduce<number>((valueMax, value) => Math.max(valueMax, value ?? 0), maximum),
    metric === "rating" ? 5 : 1,
  );
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

/** Inspect all series at the nearest date using the pointer, keyboard or date picker */
export function TrendChart({ labels, series, metric, unit, kind = "line" }: TrendChartProps) {
  const titleId = useId();
  const tooltipId = useId();
  const [activeDate, setActiveDate] = useState("");
  const [hover, setHover] = useState<{ date: string; left: number } | null>(null);

  if (series.length === 0) {
    return <div className={styles.empty}>请选择至少一个资源，再查询数据</div>;
  }
  if (series.every((item) => item.values.every((value) => value === null))) {
    return <div className={styles.empty}>平台未返回当前范围的该指标数据</div>;
  }

  const ceiling = axisCeiling(series, metric);
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  const activeIndex = labels.indexOf(hover?.date ?? activeDate);
  const xStep = PLOT_WIDTH / Math.max(labels.length - 1, 1);
  const barGroupWidth = PLOT_WIDTH / Math.max(labels.length, 1);
  const xOf = (index: number) => (kind === "bar" ? LEFT + barGroupWidth * (index + 0.5) : LEFT + index * xStep);
  const yOf = (value: number) => TOP + PLOT_HEIGHT * (1 - value / ceiling);

  /** Convert the pointer through the SVG transform, including responsive letterboxing */
  const inspectPointer = (event: PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    if (local.x < LEFT || local.x > LEFT + PLOT_WIDTH || local.y < TOP || local.y > TOP + PLOT_HEIGHT) {
      setHover(null);
      return;
    }
    const index = Math.max(
      0,
      Math.min(
        labels.length - 1,
        kind === "bar" ? Math.floor((local.x - LEFT) / barGroupWidth) : Math.round((local.x - LEFT) / xStep),
      ),
    );
    const date = labels[index];
    if (!date) return;
    const bounds = svg.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.min(320, bounds.width - 16);
    const x = event.clientX - bounds.left;
    const left = Math.max(8, Math.min(bounds.width - width - 8, x > bounds.width / 2 ? x - width - 12 : x + 12));
    setHover({ date, left });
  };

  /** Arrow keys inspect adjacent dates; Escape clears the pinned readout */
  const inspectKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
    event.preventDefault();
    setHover(null);
    if (event.key === "Escape") {
      setActiveDate("");
      return;
    }
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? labels.length - 1
          : Math.max(
              0,
              Math.min(labels.length - 1, activeIndex < 0 ? 0 : activeIndex + (event.key === "ArrowLeft" ? -1 : 1)),
            );
    setActiveDate(labels[index] ?? "");
  };

  return (
    <div className={styles.chart}>
      <div
        className={styles.plot}
        role="slider"
        aria-label="趋势图数据，使用左右方向键查看日期，Esc 关闭提示"
        aria-valuemin={0}
        aria-valuemax={Math.max(labels.length - 1, 0)}
        aria-valuenow={Math.max(activeIndex, 0)}
        aria-valuetext={labels[Math.max(activeIndex, 0)]}
        aria-describedby={activeIndex >= 0 ? tooltipId : undefined}
        tabIndex={0}
        onKeyDown={inspectKey}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-labelledby={titleId}
          onPointerMove={inspectPointer}
          onPointerDown={inspectPointer}
        >
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
          {activeIndex >= 0 && (
            <line
              x1={xOf(activeIndex)}
              x2={xOf(activeIndex)}
              y1={TOP}
              y2={TOP + PLOT_HEIGHT}
              className={styles.crosshair}
            />
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
                    />
                  );
                }
                return (
                  <circle
                    key={labels[index]}
                    cx={xOf(index)}
                    cy={yOf(value)}
                    r={selected ? 5 : 4}
                    fill={item.color}
                    fillOpacity={
                      selected ||
                      ((index === 0 || item.values[index - 1] === null) &&
                        (index === item.values.length - 1 || item.values[index + 1] === null))
                        ? 1
                        : 0
                    }
                  />
                );
              })}
            </g>
          ))}
        </svg>
        {activeIndex >= 0 && (
          <div
            id={tooltipId}
            role="tooltip"
            className={hover ? `${styles.tooltip} ${styles.hoverTooltip}` : styles.tooltip}
            style={{ left: hover?.left ?? 8 }}
          >
            <div className={styles.tooltipHeading}>
              <strong>{labels[activeIndex]}</strong>
              <span>单位：{unit}</span>
            </div>
            <ul className={styles.tooltipList}>
              {series.map((item) => (
                <li key={item.id} className={styles.tooltipRow}>
                  <Swatch color={item.color} dashed={item.dashed} />
                  <span className={styles.tooltipName}>{item.label}</span>
                  <strong>
                    {item.values[activeIndex] == null ? "未提供" : formatValue(item.values[activeIndex], metric)}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className={styles.caption}>
        <span>单位：{unit}</span>
        <InlineSelect
          label="查看数值"
          value={activeIndex >= 0 ? (labels[activeIndex] ?? "") : ""}
          options={[{ value: "", label: "选择日期" }, ...labels.map((label) => ({ value: label, label }))]}
          onChange={(date) => {
            setHover(null);
            setActiveDate(date);
          }}
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
