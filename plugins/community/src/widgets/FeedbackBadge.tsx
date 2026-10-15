import type { FeedbackType } from "../mock";
import styles from "./FeedbackBadge.module.css";

const toneClass: Record<FeedbackType, string | undefined> = {
  故障问题: styles.danger,
  内容侵权: styles.danger,
  组件冲突: styles.warning,
  玩法建议: styles.success,
  我的山头: styles.success,
  性能反馈: styles.muted,
  其他: styles.muted,
};

/** Small outlined badge whose color reflects the feedback category */
export function FeedbackBadge({ type }: { type: FeedbackType }) {
  return <span className={`${styles.badge} ${toneClass[type]}`}>{type}</span>;
}
