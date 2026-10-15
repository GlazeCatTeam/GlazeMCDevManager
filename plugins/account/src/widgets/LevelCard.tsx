import { Notice, Panel, ProgressBar, TextButton, useHostQuery } from "@glaze/plugin-sdk";
import styles from "./LevelCard.module.css";

const count = new Intl.NumberFormat("zh-CN");
const classNames: Record<number, string> = {
  1: "元气新星",
  2: "巧手工匠",
  3: "杰出精英",
  4: "创造大师",
  5: "传奇宗师",
};
const contributionNames: Record<number, string> = {
  1: "一览众山小",
  2: "起飞时刻",
  3: "奋斗老铁",
  4: "咸鱼潜水",
  5: "躺平的村民",
};

/** Read the selected account's level and monthly contributions through the existing host capability */
export function LevelCard({ accountId, className }: { accountId: string; className?: string | undefined }) {
  const { data: info, error, loading, reload } = useHostQuery("developer.level", { account: accountId });
  const gained = info ? info.totalExp - info.expFloor : 0;
  const needed = info ? info.expCeiling - info.expFloor : 0;
  const progress = needed > 0 ? gained / needed : 0;
  const expText = `经验 ${count.format(gained)} / ${count.format(needed)}`;
  const contributions = [
    { title: "组件贡献", data: info?.contribution },
    { title: "网络游戏", data: info?.netGameContribution },
  ];

  return (
    <Panel
      aria-label="开发者等级"
      className={className}
      title="开发者等级"
      actions={
        <div className={styles.actions}>
          {info && !error && (
            <span className={styles.hint}>{info.upgradeClassAchieve ? "升阶任务已完成" : "升阶任务未完成"}</span>
          )}
          <TextButton onClick={reload} disabled={loading}>
            {loading ? "加载中…" : error ? "重试" : "刷新"}
          </TextButton>
        </div>
      }
    >
      {error ? (
        <Notice>开发者等级加载失败：{error.message}</Notice>
      ) : !info ? (
        <span role="status" className={styles.hint}>
          正在加载开发者等级…
        </span>
      ) : (
        <>
          <div className={styles.level}>
            <span className={styles.lv}>Lv.{info.level}</span>
            <span className={styles.levelName}>
              {info.levelClass} 阶{classNames[info.levelClass] ? ` · ${classNames[info.levelClass]}` : ""}
            </span>
          </div>
          <div className={styles.progress}>
            <ProgressBar value={progress} label={expText} />
            <span className={styles.hint}>{expText}</span>
          </div>
          <div className={styles.contributions}>
            {info.contributionMonth && <span className={styles.month}>贡献月份：{info.contributionMonth}</span>}
            {contributions.map(({ title, data }) => (
              <div key={title} className={styles.contribution}>
                <span className={styles.contributionTitle}>{title}</span>
                {data ? (
                  <dl className={styles.stats}>
                    <dt>分数</dt>
                    <dd>{data.score}</dd>
                    <dt>排名</dt>
                    <dd>{data.rank > 0 ? count.format(data.rank) : "未上榜"}</dd>
                    <dt>等级</dt>
                    <dd className={styles.grade}>{contributionNames[data.grade] ?? `等级 ${data.grade}`}</dd>
                  </dl>
                ) : (
                  <span className={styles.hint}>暂无贡献数据</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
