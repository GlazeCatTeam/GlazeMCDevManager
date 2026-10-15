import styles from "./InlineSelect.module.css";

export interface InlineSelectProps {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

/** Native select with its label inline, e.g. "月份 [2026-10]" */
export function InlineSelect({ label, value, options, onChange }: InlineSelectProps) {
  return (
    <label className={styles.label}>
      {label}
      <select className={styles.select} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
