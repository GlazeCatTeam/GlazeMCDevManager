import { Button } from "@glaze/plugin-sdk";
import type { ReactNode } from "react";
import styles from "./SettingsPage.module.css";

/** Setting label and description aligned with its control */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingCopy}>
        <span className={styles.settingTitle}>{title}</span>
        <span className={styles.muted}>{description}</span>
      </div>
      <div className={styles.settingControl}>{children}</div>
    </div>
  );
}

interface Choice<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface ChoiceGroupProps<T extends string | number> {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}

/** Compact mutually exclusive options with an accessible selection state */
export function ChoiceGroup<T extends string | number>({ label, value, choices, onChange }: ChoiceGroupProps<T>) {
  return (
    <fieldset className={`${styles.choices} ${styles.choiceGroup}`} aria-label={label}>
      {choices.map((choice) => (
        <Button
          key={choice.value}
          size="xs"
          variant={value === choice.value ? "primary" : "secondary"}
          aria-pressed={value === choice.value}
          disabled={choice.disabled}
          onClick={() => onChange(choice.value)}
        >
          {choice.label}
        </Button>
      ))}
    </fieldset>
  );
}
