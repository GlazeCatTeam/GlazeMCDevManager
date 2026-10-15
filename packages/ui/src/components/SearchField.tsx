import { Icon } from "./Icon";
import styles from "./SearchField.module.css";

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Accessible name; defaults to the placeholder */
  label?: string | undefined;
}

/** Fixed-width search box with a pixel magnifier */
export function SearchField({ value, onChange, placeholder, label }: SearchFieldProps) {
  return (
    <label className={styles.search}>
      <Icon name="action.search" size={16} />
      <input
        type="search"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
