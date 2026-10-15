import { type AvailableTheme, Button, SegmentedControl, usePluginRegistry } from "@glaze/plugin-sdk";
import type { CSSProperties } from "react";
import type { AppearanceSettings } from "../mock";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import styles from "./AppearanceSection.module.css";
import sections from "./Sections.module.css";

const previewThemes: Pick<AvailableTheme, "id" | "name" | "description" | "modes">[] = [
  { id: "ore-ui", name: "Ore UI", description: "方块风格", modes: ["dark", "light"] },
  { id: "fluent-dark", name: "Fluent 深色", description: "简约、柔和", modes: ["dark"] },
];

const scales = ([90, 100, 110, 125] as const).map((scale) => ({ value: scale, label: `${scale}%` }));

export interface AppearanceSectionProps {
  value: AppearanceSettings;
  onChange: (value: AppearanceSettings) => void;
  onRestoreLayout: () => void;
  disabled?: boolean | undefined;
  themePreviewStyles?: Record<string, CSSProperties> | undefined;
}

/** Theme cards, color mode, interface scale and layout reset */
export function AppearanceSection({
  value,
  onChange,
  onRestoreLayout,
  disabled,
  themePreviewStyles,
}: AppearanceSectionProps) {
  const registry = usePluginRegistry();
  const themes = registry?.snapshot?.themes ?? previewThemes;
  const modes = themes.find((theme) => theme.id === value.themeId)?.modes ?? ["dark"];
  const colorModes = [
    { value: "dark", label: "深色", disabled: !modes.includes("dark") },
    { value: "light", label: "浅色", disabled: !modes.includes("light") },
    { value: "system", label: "跟随系统", disabled: modes.length < 2 },
  ] as const;

  /** Keep the current mode only if the newly selected theme supports it */
  const pickTheme = (themeId: AppearanceSettings["themeId"]) => {
    const supported = themes.find((theme) => theme.id === themeId)?.modes ?? ["dark"];
    const valid = value.colorMode === "system" ? supported.length === 2 : supported.includes(value.colorMode);
    onChange({ ...value, themeId, colorMode: valid ? value.colorMode : (supported[0] ?? "dark") });
  };

  return (
    <fieldset
      className={`${sections.stack} ${styles.controls}`}
      disabled={disabled}
      aria-label="外观选项"
      aria-busy={disabled}
    >
      <SettingGroup title="主题">
        <div className={styles.cards}>
          {themes.map((theme) => {
            const selected = value.themeId === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={selected ? `${styles.card} ${styles.selected}` : styles.card}
                aria-pressed={selected}
                onClick={() => pickTheme(theme.id)}
              >
                <span className={styles.preview} style={themePreviewStyles?.[theme.id]} aria-hidden="true">
                  {themePreviewStyles?.[theme.id] ? (
                    <>
                      <span className={styles.previewSidebar} />
                      <span className={styles.previewPanel} />
                      <span className={styles.previewButton} />
                    </>
                  ) : (
                    <span>预览暂不可用</span>
                  )}
                </span>
                <span className={styles.label}>
                  <span>
                    <strong>{theme.name}</strong>
                    <span className={styles.description}>{theme.description}</span>
                  </span>
                  {selected && <span className={styles.inUse}>使用中</span>}
                </span>
              </button>
            );
          })}
        </div>
      </SettingGroup>

      <SettingGroup title="显示">
        <SettingRow
          title="颜色模式"
          description={
            modes.length < 2
              ? `当前主题仅支持${modes[0] === "light" ? "浅色" : "深色"}模式`
              : "选择深色、浅色或跟随系统外观"
          }
        >
          <SegmentedControl
            label="颜色模式"
            options={colorModes}
            value={value.colorMode}
            onChange={(colorMode) => onChange({ ...value, colorMode })}
          />
        </SettingRow>
        <SettingRow title="界面缩放" description="调整文字和控件的显示大小">
          <SegmentedControl
            label="界面缩放"
            options={scales}
            value={value.scale}
            onChange={(scale) => onChange({ ...value, scale })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="排版">
        <SettingRow title="恢复默认排版" description="恢复首页排行榜的默认显示项；当前页面位置和大小固定">
          <Button size="xs" onClick={onRestoreLayout}>
            恢复默认
          </Button>
        </SettingRow>
      </SettingGroup>
    </fieldset>
  );
}
