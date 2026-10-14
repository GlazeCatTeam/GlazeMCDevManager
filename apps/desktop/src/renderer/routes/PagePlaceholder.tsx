import styles from "./PagePlaceholder.module.css";

/** Stand-in for pages that are not built yet */
export function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.hint}>页面尚未实现</p>
    </div>
  );
}
