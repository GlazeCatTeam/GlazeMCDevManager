import { Button, PixelAvatar, ProgressBar } from "@glaze/plugin-sdk";
import { formatCount } from "../format";
import type { HomeAccount } from "../mock";
import styles from "./Greeting.module.css";

export interface GreetingProps {
  account: HomeAccount;
  onRefresh: () => void;
}

/** Page header: greeting, developer level and experience progress */
export function Greeting({ account, onRefresh }: GreetingProps) {
  const { floor, ceiling, total } = account.exp;
  const progress = ceiling > floor ? (total - floor) / (ceiling - floor) : 0;
  const expText = `经验 ${formatCount(total)} / ${formatCount(ceiling)}`;

  return (
    <section className={styles.greeting} aria-label="问候与等级">
      <PixelAvatar colors={account.avatar} size={64} />
      <div className={styles.text}>
        <h1 className={styles.title}>Hi，{account.nickname}！</h1>
        <div className={styles.level}>
          <span className={styles.levelName}>
            <span className={styles.lv}>Lv.{account.level}</span> · {account.levelName}
          </span>
          <ProgressBar className={styles.progress} value={progress} label={expText} />
          <span className={styles.exp}>{expText}</span>
        </div>
      </div>
      <Button onClick={onRefresh}>刷新</Button>
    </section>
  );
}
