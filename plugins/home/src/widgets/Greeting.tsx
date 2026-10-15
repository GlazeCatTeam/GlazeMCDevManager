import { Avatar, type AvatarColors, Button, type DeveloperLevel, ProgressBar } from "@glaze/plugin-sdk";
import { formatCompact, MISSING } from "../format";
import styles from "./Greeting.module.css";

export interface GreetingProps {
  nickname: string;
  /** Proxied avatar image; null shows the pixel face */
  avatarSrc: string | null;
  avatar: AvatarColors;
  /** null until the level has loaded */
  level: DeveloperLevel | null;
  refreshing: boolean;
  onRefresh: () => void;
}

/** Page header: greeting, developer class and level, experience progress within the level */
export function Greeting({ nickname, avatarSrc, avatar, level, refreshing, onRefresh }: GreetingProps) {
  const gained = level ? level.totalExp - level.expFloor : 0;
  const needed = level ? level.expCeiling - level.expFloor : 0;
  const progress = needed > 0 ? gained / needed : 0;
  const expText = level ? `经验 ${formatCompact(gained)} / ${formatCompact(needed)}` : `经验 ${MISSING}`;

  return (
    <section className={styles.greeting} aria-label="问候与等级">
      <Avatar src={avatarSrc} colors={avatar} size={64} />
      <div className={styles.text}>
        <h1 className={styles.title}>Hi，{nickname}！</h1>
        <div className={styles.level}>
          <span className={styles.levelName}>
            {level ? (
              <>
                {level.levelClass} 阶 · <span className={styles.lv}>Lv.{level.level}</span>
              </>
            ) : (
              <span className={styles.lv}>Lv.{MISSING}</span>
            )}
          </span>
          <ProgressBar className={styles.progress} value={progress} label={expText} />
          <span className={styles.exp}>{expText}</span>
        </div>
      </div>
      <Button onClick={onRefresh} disabled={refreshing}>
        {refreshing ? "刷新中…" : "刷新"}
      </Button>
    </section>
  );
}
