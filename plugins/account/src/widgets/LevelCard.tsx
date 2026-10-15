import { Panel, ProgressBar } from "@glaze/plugin-sdk";
import type { LevelInfo } from "../mock";
import styles from "./LevelCard.module.css";

const count = new Intl.NumberFormat("zh-CN");

/** Developer level, experience progress and monthly contribution scores */
export function LevelCard({ info, className }: { info: LevelInfo; className?: string | undefined }) {
  const { floor, ceiling, total } = info.exp;
  const progress = ceiling > floor ? (total - floor) / (ceiling - floor) : 0;
  const expText = `经验 ${count.format(total)} / ${count.format(ceiling)}`;

  return (
    <Panel
      aria-label="开发者等级"
      className={className}
      title="开发者等级"
      actions={<span className={styles.hint}>{info.upgradeClassAchieve ? "升阶任务已完成" : "升阶任务未完成"}</span>}
    >
      <div className={styles.level}>
        <span className={styles.lv}>Lv.{info.level}</span>
        <span className={styles.levelName}>{info.levelName}</span>
      </div>
      <div className={styles.progress}>
        <ProgressBar value={progress} label={expText} />
        <span className={styles.hint}>{expText}</span>
      </div>
      <div className={styles.contributions}>
        {info.contributions.map((item) => (
          <div key={item.title} className={styles.contribution}>
            <span className={styles.contributionTitle}>{item.title}</span>
            <dl className={styles.stats}>
              <dt>分数</dt>
              <dd>{count.format(item.score)}</dd>
              <dt>排名</dt>
              <dd>{count.format(item.rank)}</dd>
              <dt>等级</dt>
              <dd className={styles.grade}>{item.grade}</dd>
            </dl>
          </div>
        ))}
      </div>
    </Panel>
  );
}
