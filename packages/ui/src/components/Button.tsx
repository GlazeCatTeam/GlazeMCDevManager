import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  /** xs is for compact per-item actions inside tiles */
  size?: "md" | "sm" | "lg" | "xs";
}

/** Block-style button; one primary button per page, the rest secondary */
export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], size === "md" ? undefined : styles[size], className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}

export interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** "subtle" is a muted underlined link, e.g. "使用 Cookie 登录" */
  tone?: "link" | "warning" | "danger" | "subtle";
}

const toneClass = {
  link: undefined,
  warning: styles.textWarning,
  danger: styles.textDanger,
  subtle: styles.textSubtle,
};

/** Low-emphasis inline action such as "查看详情", "重试" or "删除" */
export function TextButton({ tone = "link", className, type = "button", ...rest }: TextButtonProps) {
  const classes = [styles.text, toneClass[tone], className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...rest} />;
}
