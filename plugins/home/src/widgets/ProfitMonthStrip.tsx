import { Icon, Tag } from "@glaze/plugin-sdk";
import { formatYuan } from "../format";
import type { ProfitEstimate } from "../mock";
import styles from "./ProfitMonthStrip.module.css";

export interface ProfitMonthStripProps {
  title: string;
  data: ProfitEstimate;
  onSelect: () => void;
}

/** Compact tile for another month's estimate; clicking it brings that month into the main card */
export function ProfitMonthStrip({ title, data, onSelect }: ProfitMonthStripProps) {
  return (
    <button type="button" className={styles.strip} aria-label={`切换到${title}`} onClick={onSelect}>
      <Icon name="income.coin" size={20} className={styles.icon} />
      <span className={styles.title}>{title}</span>
      <Tag>估算</Tag>
      <span className={styles.amounts}>
        <span className={styles.total}>{formatYuan(data.totalYuan)}</span>
        <span className={styles.afterTax}>扣税后约 {formatYuan(data.afterTaxYuan)}</span>
      </span>
      <Icon name="action.chevronRight" size={12} className={styles.icon} />
    </button>
  );
}
