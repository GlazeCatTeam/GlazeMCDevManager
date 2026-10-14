import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "md" | "sm";
}

/** Block-style button; one primary button per page, the rest secondary */
export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], size === "sm" ? styles.sm : undefined, className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}

export interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "link" | "warning";
}

/** Low-emphasis inline action such as "查看详情" or "重试" */
export function TextButton({ tone = "link", className, type = "button", ...rest }: TextButtonProps) {
  const classes = [styles.text, tone === "warning" ? styles.textWarning : undefined, className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
