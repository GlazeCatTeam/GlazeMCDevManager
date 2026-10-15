import { Button } from "./Button";
import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean | undefined;
}

export interface SegmentedControlProps<T extends string | number> {
  /** Accessible name of the group */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Row of compact block buttons for one exclusive choice; the selected one is primary */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className={styles.group} aria-label={label}>
      {options.map((option) => (
        <Button
          key={option.value}
          size="xs"
          variant={value === option.value ? "primary" : "secondary"}
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}
