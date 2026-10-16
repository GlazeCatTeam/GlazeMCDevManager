import { Button } from "@glaze/plugin-sdk";
import { type KeyboardEvent, type PointerEvent, useId, useLayoutEffect, useRef, useState } from "react";
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
    metric === "rating" ? 5 : metric === "refundRate" ? 0.01 : 1,
  );
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  return Math.ceil(maxValue / magnitude / 0.5) * magnitude * 0.5;
}

/** SVG path of one line series, broken where values are missing */
function linePath(values: (number | null)[], xStep: number, ceiling: number, plotHeight: number): string {
  return values
    .map((value, index) => {
      if (value === null) {
        return "";
      }
      const command = index === 0 || values[index - 1] === null ? "M" : "L";
      return `${command}${LEFT + index * xStep},${TOP + plotHeight * (1 - value / ceiling)}`;
    })
    .join(" ");
}

/** Inspect dates in a persistent readout without covering the plotted series */
export function TrendChart({ labels, series: allSeries, metric, unit, kind = "line" }: TrendChartProps) {
  const titleId = useId();
  const readoutId = useId();
  const [activeDate, setActiveDate] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: CHART_WIDTH, height: CHART_HEIGHT });
  const hasData = allSeries.some((item) => item.values.some((value) => value !== null));
  useLayoutEffect(() => {
    if (!plot.current || !hasData) return;
    // Match SVG units to layout pixels so legends never squeeze or stretch axis text
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, [hasData]);
  const plotWidth = Math.max(1, size.width - LEFT - 20);
  const plotHeight = Math.max(1, size.height - TOP - 40);
  // Keep at least one current series visible when filters replace the previous selection
  const visible = allSeries.filter((item) => !hidden.includes(item.id));
  const series = visible.length ? visible : allSeries;

  if (series.length === 0) {
    return <div className={styles.empty}>选择至少一个资源后自动展示趋势</div>;
  }
  if (!hasData) {
    return <div className={styles.empty}>平台未返回当前范围的该指标数据</div>;
  }

  const ceiling = axisCeiling(series, metric);
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));
  const pinnedIndex = labels.indexOf(activeDate);
  const activeIndex = Math.max(
    0,
    labels.indexOf(hover ?? labels[pinnedIndex >= 0 ? pinnedIndex : labels.length - 1] ?? ""),
  );
  // Rank the readout by the inspected date, keeping ties stable and missing values last
  const rankedSeries = [...allSeries].sort((left, right) => {
    const leftValue = left.values[activeIndex];
    const rightValue = right.values[activeIndex];
    if (leftValue == null) return rightValue == null ? 0 : 1;
    if (rightValue == null) return -1;
    return rightValue - leftValue;
  });
  const highlight = series.some((item) => item.id === highlighted) ? highlighted : null;
  const xStep = plotWidth / Math.max(labels.length - 1, 1);
  const barGroupWidth = plotWidth / Math.max(labels.length, 1);
  const xOf = (index: number) => (kind === "bar" ? LEFT + barGroupWidth * (index + 0.5) : LEFT + index * xStep);
  const yOf = (value: number) => TOP + plotHeight * (1 - value / ceiling);

  /** Convert the pointer through the SVG transform, including responsive letterboxing */
  const inspectPointer = (event: PointerEvent<SVGSVGElement>, pin = false) => {
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    if (local.x < LEFT || local.x > LEFT + plotWidth || local.y < TOP || local.y > TOP + plotHeight) {
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
    setHover(date);
    if (pin) setActiveDate(date);
  };

  /** Select a date from the picker, buttons or keyboard and clear transient previews */
  const selectDate = (date: string) => {
    setHover(null);
    setActiveDate(date);
  };

  /** Arrow keys inspect adjacent dates; Escape returns to the latest date */
  const inspectKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
    event.preventDefault();
    setHover(null);
    if (event.key === "Escape") {
      selectDate("");
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
        ref={plot}
        className={styles.plot}
        role="slider"
        aria-label="趋势图数据，使用左右方向键查看日期，Esc 返回最新日期"
        aria-valuemin={0}
        aria-valuemax={Math.max(labels.length - 1, 0)}
        aria-valuenow={Math.max(activeIndex, 0)}
        aria-valuetext={labels[Math.max(activeIndex, 0)]}
        aria-describedby={readoutId}
        tabIndex={0}
        onKeyDown={inspectKey}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-labelledby={titleId}
          onPointerMove={(event) => inspectPointer(event)}
          onPointerDown={(event) => inspectPointer(event, true)}
        >
          <title id={titleId}>
            {`${unit}趋势：${labels[0]} 至 ${labels.at(-1)}，${series.map((item) => item.label).join("、")}`}
          </title>
          {GRID_STEPS.map((step) => {
            const y = TOP + plotHeight - (step / 4) * plotHeight;
            return (
              <g key={step}>
                <line x1={LEFT} x2={LEFT + plotWidth} y1={y} y2={y} className={styles.gridLine} />
                <text x={LEFT - 12} y={y + 4} textAnchor="end" className={styles.axisLabel}>
                  {metric === "refundRate"
                    ? formatValue((step / 4) * ceiling, metric)
                    : axisLabel((step / 4) * ceiling)}
                </text>
              </g>
            );
          })}
          {labels.map((label, index) =>
            index % labelStep === 0 || index === labels.length - 1 ? (
              <text key={label} x={xOf(index)} y={size.height - 12} textAnchor="middle" className={styles.axisLabel}>
                {label.length === 7 ? `${label.slice(2, 4)}/${label.slice(5)}` : label.slice(5).replace("-", "/")}
              </text>
            ) : null,
          )}
          {activeIndex >= 0 && (
            <line
              x1={xOf(activeIndex)}
              x2={xOf(activeIndex)}
              y1={TOP}
              y2={TOP + plotHeight}
              className={styles.crosshair}
            />
          )}
          {series.map((item, seriesIndex) => (
            <g key={item.id} opacity={highlight && highlight !== item.id ? 0.18 : 1} data-series-id={item.id}>
              {kind === "line" && (
                <path
                  fill="none"
                  stroke={item.color}
                  strokeWidth={highlight === item.id ? 3.5 : 2.5}
                  strokeDasharray={item.dashed ? "6 5" : undefined}
                  d={linePath(item.values, xStep, ceiling, plotHeight)}
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
                      height={TOP + plotHeight - yOf(value)}
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
      </div>
      <div className={styles.caption}>
        <div className={styles.dateControls}>
          <Button
            size="xs"
            aria-label="上一个日期"
            disabled={activeIndex <= 0}
            onClick={() => selectDate(labels[activeIndex - 1] ?? "")}
          >
            ←
          </Button>
          <InlineSelect
            label="查看数值"
            value={labels[activeIndex] ?? ""}
            options={labels.map((label) => ({ value: label, label }))}
            onChange={selectDate}
          />
          <Button
            size="xs"
            aria-label="下一个日期"
            disabled={activeIndex >= labels.length - 1}
            onClick={() => selectDate(labels[activeIndex + 1] ?? "")}
          >
            →
          </Button>
        </div>
        <div className={styles.readoutActions}>
          <span>
            单位：{unit} · 已显示 {series.length}/{allSeries.length}
          </span>
          <Button size="xs" disabled={series.length === allSeries.length} onClick={() => setHidden([])}>
            显示全部
          </Button>
        </div>
      </div>
      <p className={styles.hint}>按当前数值从高到低排列 · 点击图表固定日期 · 悬停资源高亮曲线，点击切换显示</p>
      <fieldset id={readoutId} className={styles.legend} aria-label="图表系列，点击切换显示">
        {rankedSeries.map((item) => {
          const value = activeIndex >= 0 ? item.values[activeIndex] : undefined;
          const shown = series.some((entry) => entry.id === item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.legendItem} ${shown ? "" : styles.hiddenSeries}`}
              aria-pressed={shown}
              title={`${shown ? "隐藏" : "显示"}${item.label}`}
              disabled={shown && series.length === 1}
              onPointerEnter={() => setHighlighted(item.id)}
              onPointerLeave={() => setHighlighted(null)}
              onFocus={() => setHighlighted(item.id)}
              onBlur={() => setHighlighted(null)}
              onClick={() =>
                setHidden(shown ? [...(visible.length ? hidden : []), item.id] : hidden.filter((id) => id !== item.id))
              }
            >
              <Swatch color={item.color} dashed={item.dashed} />
              <span className={styles.legendName}>{item.label}</span>
              <strong className={styles.legendValue}>{value == null ? "未提供" : formatValue(value, metric)}</strong>
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
