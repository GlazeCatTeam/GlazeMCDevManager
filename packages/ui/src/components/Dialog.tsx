import { type ReactNode, useEffect, useRef } from "react";
import styles from "./Dialog.module.css";

export interface DialogProps {
  title: string;
  children?: ReactNode;
  /** Buttons on the bottom right; put the safe action first */
  actions: ReactNode;
  onClose: () => void;
  className?: string | undefined;
}

/** Modal confirmation dialog; Escape or clicking the backdrop closes it */
export function Dialog({ title, children, actions, onClose, className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the first action so keyboard users land inside the dialog
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[styles.dialog, className].filter(Boolean).join(" ")}
      >
        <span className={styles.title}>{title}</span>
        {children && <div className={styles.body}>{children}</div>}
        <div className={styles.actions}>{actions}</div>
      </div>
    </div>
  );
}
