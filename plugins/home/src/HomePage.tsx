import { useState } from "react";
import styles from "./HomePage.module.css";
import { account, overview, type ProfitMonth, profitMonthLabels, profits } from "./mock";
import { Greeting } from "./widgets/Greeting";
import { OverviewStrip } from "./widgets/OverviewStrip";
import { ProfitEstimateCard } from "./widgets/ProfitEstimateCard";
import { ProfitMonthStrip } from "./widgets/ProfitMonthStrip";
import { RankingCard } from "./widgets/RankingCard";

// Actions are no-ops until data loading and navigation exist
const noop = () => {};

/** Home page; a fixed arrangement for now, moved onto the layout grid in M1 */
export function HomePage() {
  const [month, setMonth] = useState<ProfitMonth>("this");
  const otherMonth: ProfitMonth = month === "this" ? "last" : "this";

  return (
    <div className={styles.page}>
      <Greeting account={account} onRefresh={noop} />
      <OverviewStrip data={overview} />
      <div className={styles.columns}>
        <div className={`${styles.column} ${styles.profitColumn}`}>
          <ProfitEstimateCard
            className={styles.profitMain}
            title={profitMonthLabels[month]}
            data={profits[month]}
            onRetry={noop}
            onOpenDetail={noop}
          />
          <ProfitMonthStrip
            title={profitMonthLabels[otherMonth]}
            data={profits[otherMonth]}
            onSelect={() => setMonth(otherMonth)}
          />
        </div>
        <RankingCard className={styles.column} onOpenAll={noop} />
      </div>
    </div>
  );
}
