import { avatarColorsFor, Notice, remoteImageUrl, TextButton, useHostQuery, useSession } from "@glaze/plugin-sdk";
import { useMemo, useState } from "react";
import styles from "./HomePage.module.css";
import { Greeting } from "./widgets/Greeting";
import { OverviewStrip } from "./widgets/OverviewStrip";
import { ProfitEstimateCard } from "./widgets/ProfitEstimateCard";
import { ProfitMonthStrip } from "./widgets/ProfitMonthStrip";
import { RankingCard } from "./widgets/RankingCard";

type ProfitMonth = "this" | "last";

const profitMonthLabels: Record<ProfitMonth, string> = {
  this: "本月收益速算",
  last: "上月收益速算",
};

// Detail pages do not exist yet
const noop = () => {};

/** "YYYY-MM" of this month and last month in local time */
function recentMonths(now: Date): Record<ProfitMonth, string> {
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return { this: format(now), last: format(new Date(now.getFullYear(), now.getMonth() - 1, 1)) };
}

/** Home page; a fixed arrangement for now, moved onto the layout grid in M1 */
export function HomePage() {
  const { current } = useSession();
  const [month, setMonth] = useState<ProfitMonth>("this");
  const otherMonth: ProfitMonth = month === "this" ? "last" : "this";
  const months = useMemo(() => recentMonths(new Date()), []);

  const level = useHostQuery("developer.level");
  const overview = useHostQuery("analytics.overview");
  const thisMonth = useHostQuery("income.estimate", { month: months.this });
  const lastMonth = useHostQuery("income.estimate", { month: months.last });
  const estimates = { this: thisMonth, last: lastMonth };

  const refreshing = level.loading || overview.loading || thisMonth.loading || lastMonth.loading;
  const refresh = () => {
    level.reload();
    overview.reload();
    thisMonth.reload();
    lastMonth.reload();
  };
  const summaryError = overview.error ?? level.error;

  if (!current) {
    return null;
  }

  return (
    <div className={styles.page}>
      <Greeting
        nickname={current.nickname}
        avatarSrc={remoteImageUrl(current.avatarUrl)}
        avatar={avatarColorsFor(current.id)}
        level={level.data}
        refreshing={refreshing}
        onRefresh={refresh}
      />
      {summaryError && (
        <Notice
          action={
            <TextButton tone="warning" onClick={refresh}>
              重试
            </TextButton>
          }
        >
          数据加载失败：{summaryError.message}
        </Notice>
      )}
      <OverviewStrip data={overview.data} />
      <div className={styles.columns}>
        <div className={`${styles.column} ${styles.profitColumn}`}>
          <ProfitEstimateCard
            className={styles.profitMain}
            title={profitMonthLabels[month]}
            data={estimates[month].data}
            error={estimates[month].error?.message ?? null}
            loading={estimates[month].loading}
            onRetry={estimates[month].reload}
            onOpenDetail={noop}
          />
          <ProfitMonthStrip
            title={profitMonthLabels[otherMonth]}
            data={estimates[otherMonth].data}
            onSelect={() => setMonth(otherMonth)}
          />
        </div>
        <RankingCard className={styles.column} onOpenAll={noop} />
      </div>
    </div>
  );
}
