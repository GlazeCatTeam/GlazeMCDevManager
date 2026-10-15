import { Button } from "@glaze/plugin-sdk";
import { ChoiceGroup, SettingRow } from "./controls";
import type { AppearanceSettings } from "./mock";
import styles from "./SettingsPage.module.css";

interface AppearanceContentProps {
  value: AppearanceSettings;
  onChange: (value: AppearanceSettings) => void;
  onRestore: () => void;
}

/** Theme previews and session appearance controls matching the design board */
export function AppearanceContent({ value, onChange, onRestore }: AppearanceContentProps) {
  const fluent = value.themeId === "fluent-dark";

  return (
    <div className={styles.sections}>
      <section className={styles.section} aria-label="主题">
        <h3 className={styles.sectionTitle}>主题</h3>
        <div className={styles.themeCards}>
          {(
            [
              { id: "ore-ui", name: "Ore UI", description: "方块风格" },
              { id: "fluent-dark", name: "Fluent 深色", description: "简约、柔和" },
            ] as const
          ).map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`${styles.themeCard} ${value.themeId === theme.id ? styles.themeSelected : ""}`}
              aria-pressed={value.themeId === theme.id}
              onClick={() =>
                onChange({
                  ...value,
                  themeId: theme.id,
                  colorMode: theme.id === "fluent-dark" ? "dark" : value.colorMode,
                })
              }
            >
              <span
                className={`${styles.themePreview} ${theme.id === "fluent-dark" ? styles.fluentPreview : ""}`}
                aria-hidden="true"
              >
                <span className={styles.previewSidebar} />
                <span className={styles.previewPanel} />
                <span className={styles.previewButton} />
              </span>
              <span className={styles.themeLabel}>
                <span>
                  <strong>{theme.name}</strong>
                  <span className={styles.themeDescription}>{theme.description}</span>
                </span>
                {value.themeId === theme.id && <span className={styles.selectedLabel}>使用中</span>}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-label="显示">
        <h3 className={styles.sectionTitle}>显示</h3>
        <SettingRow
          title="颜色模式"
          description={fluent ? "Fluent 主题目前仅支持深色模式" : "选择深色、浅色或跟随系统外观"}
        >
          <ChoiceGroup<AppearanceSettings["colorMode"]>
            label="颜色模式"
            value={value.colorMode}
            choices={[
              { value: "dark", label: "深色" },
              { value: "light", label: "浅色", disabled: fluent },
              { value: "system", label: "跟随系统", disabled: fluent },
            ]}
            onChange={(colorMode) => onChange({ ...value, colorMode })}
          />
        </SettingRow>
        <SettingRow title="界面缩放" description="调整文字和控件的显示大小">
          <ChoiceGroup<AppearanceSettings["scale"]>
            label="界面缩放"
            value={value.scale}
            choices={[90, 100, 110, 125].map((scale) => ({
              value: scale as AppearanceSettings["scale"],
              label: `${scale}%`,
            }))}
            onChange={(scale) => onChange({ ...value, scale })}
          />
        </SettingRow>
      </section>

      <section className={styles.section} aria-label="排版">
        <h3 className={styles.sectionTitle}>排版</h3>
        <SettingRow title="恢复默认排版" description="将所有页面的组件位置和大小恢复为默认值">
          <Button size="xs" onClick={onRestore}>
            恢复默认
          </Button>
        </SettingRow>
      </section>
    </div>
  );
}
