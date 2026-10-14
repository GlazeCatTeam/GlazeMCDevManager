import { formatCount } from "../format";
import type { Overview } from "../mock";
import styles from "./OverviewStrip.module.css";

interface Cell {
  mainLabel: string;
  mainValue: number;
  subLabel: string;
  subValue: number;
}

/** Four-cell summary: this month vs last month, yesterday vs 14-day average */
export function OverviewStrip({ data }: { data: Overview }) {
  const cells: Cell[] = [
    {
      mainLabel: "本月收益（钻石）",
      mainValue: data.thisMonthDiamond,
      subLabel: "上月",
      subValue: data.lastMonthDiamond,
    },
    { mainLabel: "本月下载", mainValue: data.thisMonthDownload, subLabel: "上月", subValue: data.lastMonthDownload },
    {
      mainLabel: "昨日收益（钻石）",
      mainValue: data.yesterdayDiamond,
      subLabel: "14 日均",
      subValue: data.days14AverageDiamond,
    },
    {
      mainLabel: "昨日下载",
      mainValue: data.yesterdayDownload,
      subLabel: "14 日均",
      subValue: data.days14AverageDownload,
    },
  ];

  return (
    <section className={styles.strip} aria-label="数据概览">
      {cells.map((cell) => (
        <div key={cell.mainLabel} className={styles.cell}>
          <span className={styles.label}>{cell.mainLabel}</span>
          <span className={styles.value}>{formatCount(cell.mainValue)}</span>
          <span className={styles.sub}>
            <span className={styles.label}>{cell.subLabel} </span>
            <span className={styles.subValue}>{formatCount(cell.subValue)}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
