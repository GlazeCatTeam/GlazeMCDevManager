import type { AnalyticsOverview } from "@glaze/plugin-sdk";
import { formatCount, MISSING } from "../format";
import styles from "./OverviewStrip.module.css";

interface Cell {
  mainLabel: string;
  mainValue: number | undefined;
  subLabel: string;
  subValue: number | undefined;
}

/** A value, or the placeholder until it has loaded */
function show(value: number | undefined): string {
  return value === undefined ? MISSING : formatCount(value);
}

/** Four-cell summary: this month vs last month, yesterday vs 14-day average; null until loaded */
export function OverviewStrip({ data }: { data: AnalyticsOverview | null }) {
  const cells: Cell[] = [
    {
      mainLabel: "本月收益（钻石）",
      mainValue: data?.thisMonthDiamond,
      subLabel: "上月",
      subValue: data?.lastMonthDiamond,
    },
    { mainLabel: "本月下载", mainValue: data?.thisMonthDownload, subLabel: "上月", subValue: data?.lastMonthDownload },
    {
      mainLabel: "昨日收益（钻石）",
      mainValue: data?.yesterdayDiamond,
      subLabel: "14 日均",
      subValue: data?.days14AverageDiamond,
    },
    {
      mainLabel: "昨日下载",
      mainValue: data?.yesterdayDownload,
      subLabel: "14 日均",
      subValue: data?.days14AverageDownload,
    },
  ];

  return (
    <section className={styles.strip} aria-label="数据概览">
      {cells.map((cell) => (
        <div key={cell.mainLabel} className={styles.cell}>
          <span className={styles.label}>{cell.mainLabel}</span>
          <span className={styles.value}>{show(cell.mainValue)}</span>
          <span className={styles.sub}>
            <span className={styles.label}>{cell.subLabel} </span>
            <span className={styles.subValue}>{show(cell.subValue)}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
