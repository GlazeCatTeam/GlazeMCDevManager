import { isWorkRecord, type WorkOption, type WorkRecord, type WorkValue } from "@glaze/plugin-sdk";
import { type ReactNode, useId } from "react";
import styles from "./WorkEditor.module.css";

/** Safe readers keep unexpected server values out of controlled form inputs */
export function object(value: WorkValue | undefined): WorkRecord {
  return isWorkRecord(value) ? value : {};
}
export function rows(value: WorkValue | undefined): WorkRecord[] {
  return Array.isArray(value) ? value.filter(isWorkRecord) : [];
}
export function text(value: WorkValue | undefined): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
export function number(value: WorkValue | undefined): number {
  return typeof value === "number" ? value : 0;
}

export interface EditorSectionProps {
  value: WorkRecord;
  disabled: boolean;
  change: (key: string, value: WorkValue) => void;
}

/** A compact field using the same theme tokens as the project's form controls */
export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? styles.wideField : styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}

/** Text values with explicit labels and native character limits */
export function Input({
  label,
  value,
  onChange,
  multiline = false,
  maxLength,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          className={styles.input}
          id={id}
          value={value}
          disabled={disabled}
          rows={4}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={styles.input}
          id={id}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/** Explicit yes/no radio choices use stable per-field native groups */
export function YesNo({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={styles.choice} disabled={disabled}>
      <legend>{label}</legend>
      {[true, false].map((v) => (
        <label key={String(v)}>
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          {v ? "是" : "否"}
        </label>
      ))}
    </fieldset>
  );
}

/** Retain unknown current ids so loading options cannot silently change a value */
export function Select({
  label,
  value,
  choices,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  choices: WorkOption[];
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={styles.input}
        value={value}
        disabled={disabled || !choices.length}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {!choices.some((c) => c.id === value) && <option value={value}>当前值 {value}</option>}
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  );
}
