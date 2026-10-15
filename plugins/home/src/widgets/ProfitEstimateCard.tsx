import { Icon, type IconName, type IncomeEstimate, Notice, Panel, Tag, TextButton } from "@glaze/plugin-sdk";
import type { ReactNode } from "react";
import { formatDay, formatYuan, MISSING } from "../format";
import styles from "./ProfitEstimateCard.module.css";

export interface ProfitEstimateCardProps {
  /** e.g. "本月收益速算" */
  title: string;
  /** null until the estimate has loaded */
  data: IncomeEstimate | null;
  /** Message of the latest failed load */
  error: string | null;
  loading: boolean;
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

/** A yuan amount, or the placeholder until it has loaded */
function yuan(value: number | undefined): string {
  return value === undefined ? MISSING : formatYuan(value);
}

/** A month's estimated income: diamond income, then developer share plus incentives, which make up the total */
export function ProfitEstimateCard({
  title,
  data,
  error,
  loading,
  className,
  onRetry,
  onOpenDetail,
}: ProfitEstimateCardProps) {
  const failed = data?.failedWorks.length ?? 0;
  const retry = (
    <TextButton tone="warning" onClick={onRetry}>
      重试
    </TextButton>
  );

  return (
    <Panel
      aria-label={title}
      className={className}
      icon={<Icon name="income.coin" size={20} className={styles.coin} />}
      title={title}
      badge={<Tag>估算</Tag>}
      actions={<TextButton onClick={onOpenDetail}>查看详情</TextButton>}
    >
      {error && <Notice action={retry}>收益速算失败：{error}</Notice>}
      {!error && failed > 0 && <Notice action={retry}>{failed} 个作品的收益查询失败，结果不完整</Notice>}

      <div className={styles.total}>
        <span className={styles.muted}>预计收益（元）</span>
        <span className={styles.amount}>{yuan(data?.totalYuan)}</span>
        <span className={styles.small}>扣税后约 {yuan(data?.afterTaxYuan)}</span>
      </div>

      <div className={styles.rows}>
        <div className={styles.row}>
          <RowLabel icon="income.flow">钻石收益（元）</RowLabel>
          <span className={styles.rowValue}>{yuan(data?.diamondIncomeYuan)}</span>
        </div>
        <div className={styles.row}>
          <RowLabel icon="income.share">开发者分成（元）</RowLabel>
          <span className={styles.rowValue}>{yuan(data?.developerShareYuan)}</span>
        </div>
        <div className={styles.row}>
          <RowLabel icon="income.coin">激励金额（元）</RowLabel>
          <span className={styles.rowValue}>{yuan(data?.subsidyYuan)}</span>
        </div>
      </div>

      <span className={styles.note}>
        {loading && !data ? "正在统计各作品的销售，可能需要几秒…" : ""}
        {data ? `统计 ${formatDay(data.startDate)}–${formatDay(data.endDate)}的销售，` : ""}
        {loading && !data ? "" : "按当前分成与激励规则估算，以平台结算记录为准"}
      </span>
    </Panel>
  );
}
