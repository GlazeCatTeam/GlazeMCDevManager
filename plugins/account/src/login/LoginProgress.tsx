import type { LoginStep } from "@glaze/plugin-sdk";
import styles from "./LoginProgress.module.css";

// What the user sees for each login step
const stepLabels: Record<LoginStep, string> = {
  window: "在网易登录窗口中完成登录",
  verify: "验证账号",
};

/** Segmented progress; `steps` lists the steps of this login, `step` is the one in progress */
export function LoginProgress({ steps, step }: { steps: readonly LoginStep[]; step: LoginStep }) {
  const current = Math.max(0, steps.indexOf(step));
  return (
    <div role="status" aria-live="polite" className={styles.progress}>
      <div className={styles.segments} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((item, index) => (
          <span
            key={item}
            className={index < current ? styles.done : index === current ? styles.current : styles.todo}
          />
        ))}
      </div>
      <span className={styles.caption}>
        <span className={styles.label}>{stepLabels[step]}…</span>
        <span className={styles.count}>
          {current + 1} / {steps.length}
        </span>
      </span>
    </div>
  );
}
