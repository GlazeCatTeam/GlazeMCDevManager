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
  tone?: "link" | "warning" | "danger";
}

const toneClass = { link: undefined, warning: styles.textWarning, danger: styles.textDanger };

/** Low-emphasis inline action such as "查看详情", "重试" or "删除" */
export function TextButton({ tone = "link", className, type = "button", ...rest }: TextButtonProps) {
  const classes = [styles.text, toneClass[tone], className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...rest} />;
}
