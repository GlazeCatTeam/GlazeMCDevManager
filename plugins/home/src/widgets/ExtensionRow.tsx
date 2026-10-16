import { useContributions } from "@glaze/plugin-sdk";
import { Suspense } from "react";
import styles from "./ExtensionRow.module.css";

/** Home widgets contributed by other plugins, in a fixed-height row below the built-in panels */
export function ExtensionRow() {
  const widgets = useContributions("homeWidgets");
  if (!widgets.length) return null;
  return (
    <section className={styles.row} aria-label="扩展组件">
      {widgets.map(({ pluginId, contribution, Component }) => (
        <div key={`${pluginId}/${contribution.id}`} className={styles.cell}>
          <Suspense fallback={null}>
            <Component />
          </Suspense>
        </div>
      ))}
    </section>
  );
}
