import { type ReactNode, useState } from "react";
import styles from "./Form.module.css";
import { Icon } from "./Icon";

interface FieldShellProps {
  id: string;
  label: string;
  children: ReactNode;
}

/** Label stacked above a control */
function FieldShell({ id, label, children }: FieldShellProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
    </div>
  );
}

export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | undefined;
  placeholder?: string | undefined;
  autoComplete?: string | undefined;
}

/** Single-line text input with a label */
export function TextField({ id, label, value, onChange, type = "text", placeholder, autoComplete }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label}>
      <input
        id={id}
        type={type}
        className={styles.input}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
}

/** Password input with a show / hide toggle */
export function PasswordField({ id, label, value, onChange, placeholder }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label}>
      <div className={styles.withAction}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          className={`${styles.input} ${styles.inputWithAction}`}
          value={value}
          placeholder={placeholder}
          autoComplete="current-password"
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={styles.inputAction}
          aria-label={visible ? "隐藏密码" : "显示密码"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon name="action.showPassword" size={18} />
        </button>
      </div>
    </FieldShell>
  );
}

export interface TextAreaProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number | undefined;
  placeholder?: string | undefined;
}

/** Multi-line text input with a label */
export function TextArea({ id, label, value, onChange, rows = 5, placeholder }: TextAreaProps) {
  return (
    <FieldShell id={id} label={label}>
      <textarea
        id={id}
        rows={rows}
        className={`${styles.input} ${styles.textarea}`}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** Native checkbox with an inline label */
export function Checkbox({ checked, onChange, children }: CheckboxProps) {
  return (
    <label className={styles.checkbox}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {children}
    </label>
  );
}
