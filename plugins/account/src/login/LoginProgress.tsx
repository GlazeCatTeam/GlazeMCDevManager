import styles from "./LoginProgress.module.css";

// Steps of the NetEase login protocol, shown while signing in
export const loginSteps = ["初始化", "安全验证", "获取票据", "验证账号"] as const;

/** Segmented progress for the login protocol; `step` is the index of the step in progress */
export function LoginProgress({ step }: { step: number }) {
  const current = Math.min(step, loginSteps.length - 1);
  return (
    <div role="status" aria-live="polite" className={styles.progress}>
      <div className={styles.segments}>
        {loginSteps.map((label, index) => (
          <span key={label} className={index < step ? styles.done : index === step ? styles.current : styles.todo} />
        ))}
      </div>
      <span className={styles.caption}>
        <span className={styles.label}>{loginSteps[current]}…</span>
        <span className={styles.count}>
          {current + 1} / {loginSteps.length}
        </span>
      </span>
    </div>
  );
}
