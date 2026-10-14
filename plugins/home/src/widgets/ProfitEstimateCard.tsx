import { Icon, type IconName, Notice, Panel, Tag, TextButton } from "@glaze/plugin-sdk";
import type { ReactNode } from "react";
import { formatYuan } from "../format";
import type { ProfitEstimate } from "../mock";
import styles from "./ProfitEstimateCard.module.css";

export interface ProfitEstimateCardProps {
  /** e.g. "本月收益速算" */
  title: string;
  data: ProfitEstimate;
  className?: string | undefined;
  onRetry: () => void;
  onOpenDetail: () => void;
}

/** Label with a leading muted pixel icon, used for each detail row */
function RowLabel({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className={styles.rowLabel}>
      <Icon name={icon} size={16} className={styles.rowIcon} />
      <span>{children}</span>
    </span>
  );
}

/** A month's estimated income with its diamond income and developer share */
export function ProfitEstimateCard({ title, data, className, onRetry, onOpenDetail }: ProfitEstimateCardProps) {
  return (
    <Panel
      aria-label={title}
      className={className}
      icon={<Icon name="income.coin" size={20} className={styles.coin} />}
      title={title}
      badge={<Tag>估算</Tag>}
      actions={<TextButton onClick={onOpenDetail}>查看详情</TextButton>}
    >
      {data.failedWorks > 0 && (
        <Notice
          action={
            <TextButton tone="warning" onClick={onRetry}>
              重试
            </TextButton>
          }
        >
          {data.failedWorks} 个作品的收益查询失败，结果不完整
        </Notice>
      )}

      <div className={styles.total}>
        <span className={styles.muted}>预计收益（元）</span>
        <span className={styles.amount}>{formatYuan(data.totalYuan)}</span>
        <span className={styles.small}>扣税后约 {formatYuan(data.afterTaxYuan)}</span>
      </div>

      <div className={styles.rows}>
        <div className={styles.row}>
          <RowLabel icon="income.flow">钻石收益（元）</RowLabel>
          <span className={styles.rowValue}>{formatYuan(data.diamondIncomeYuan)}</span>
        </div>
        <div className={styles.row}>
          <RowLabel icon="income.share">开发者分成（元）</RowLabel>
          <span className={styles.rowValue}>{formatYuan(data.developerShareYuan)}</span>
        </div>
      </div>

      <span className={styles.note}>按当前分成与激励规则估算，以平台结算记录为准</span>
    </Panel>
  );
}
