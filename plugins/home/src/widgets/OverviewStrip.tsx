import { type AnalyticsOverview, Icon } from "@glaze/plugin-sdk";
import diamond from "../assets/minecraft/diamond.png?no-inline";
import { formatCount, MISSING } from "../format";
import styles from "./OverviewStrip.module.css";

interface Cell {
  icon: "diamond" | "download";
  mainLabel: string;
  mainValue: number | undefined;
  subLabel: string;
  subValue: number | undefined;
}

/** A value, or the placeholder until it has loaded */
function show(value: number | undefined): string {
  return value === undefined ? MISSING : formatCount(value);
}

/** Display the original Minecraft diamond texture or the shared download icon */
function MetricIcon({ icon, size }: { icon: Cell["icon"]; size: number }) {
  return icon === "diamond" ? (
    <img src={diamond} alt="" aria-hidden="true" className={styles.icon} width={size} height={size} draggable={false} />
  ) : (
    <Icon name="action.download" size={size} className={styles.icon} />
  );
}

/** Four-cell summary with metric icons beside current and comparison values; null until loaded */
export function OverviewStrip({ data }: { data: AnalyticsOverview | null }) {
  const cells: Cell[] = [
    {
      icon: "diamond",
      mainLabel: "本月收益（钻石）",
      mainValue: data?.thisMonthDiamond,
      subLabel: "上月",
      subValue: data?.lastMonthDiamond,
    },
    {
      icon: "download",
      mainLabel: "本月下载",
      mainValue: data?.thisMonthDownload,
      subLabel: "上月",
      subValue: data?.lastMonthDownload,
    },
    {
      icon: "diamond",
      mainLabel: "昨日收益（钻石）",
      mainValue: data?.yesterdayDiamond,
      subLabel: "14 日均",
      subValue: data?.days14AverageDiamond,
    },
    {
      icon: "download",
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
          <span className={styles.value}>
            <MetricIcon icon={cell.icon} size={24} />
            {show(cell.mainValue)}
          </span>
          <span className={styles.sub}>
            <span className={styles.label}>{cell.subLabel} </span>
            <span className={styles.subValue}>
              <MetricIcon icon={cell.icon} size={12} />
              {show(cell.subValue)}
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}
