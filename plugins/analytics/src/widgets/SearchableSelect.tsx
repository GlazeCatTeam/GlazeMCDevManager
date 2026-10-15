import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { InlineSelectProps } from "./InlineSelect";
import styles from "./SearchableSelect.module.css";

/** Search a local option list without changing the selection until an option is chosen */
export function SearchableSelect({ label, value, options, onChange }: InlineSelectProps) {
  const id = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const keyword = search.trim().toLocaleLowerCase();
  const visible = options.filter((option) => option.label.toLocaleLowerCase().includes(keyword));
  const current = options.find((option) => option.value === value);
  const activeIndex = Math.min(active, visible.length - 1);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  /** Opening always starts with the full list and the current selection in view */
  const show = () => {
    setSearch("");
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  };

  /** Commit one option and return keyboard focus to the select trigger */
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  };

  /** Keep keyboard navigation inside the filtered list; IME Enter must not select */
  const move = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(0, Math.min(visible.length - 1, activeIndex + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[activeIndex];
      if (option) choose(option.value);
    }
  };

  return (
    <fieldset
      className={styles.root}
      ref={root}
      aria-labelledby={`${id}-label`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open && !event.nativeEvent.isComposing) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span id={`${id}-label`} className={styles.label}>
        {label}
      </span>
      <div className={styles.control}>
        <button
          ref={trigger}
          type="button"
          className={styles.trigger}
          aria-labelledby={`${id}-label ${id}-value`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`${id}-popup`}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              show();
            }
          }}
        >
          <span id={`${id}-value`} title={current?.label}>
            {current?.label ?? "请选择资源"}
          </span>
          <span aria-hidden="true">⌄</span>
        </button>
        {open && (
          <div id={`${id}-popup`} className={styles.popup} role="dialog" aria-label={`选择${label}`}>
            <div className={styles.search}>
              <input
                ref={input}
                type="text"
                role="combobox"
                aria-label={`搜索${label}`}
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls={`${id}-list`}
                aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
                placeholder="输入资源名称搜索…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setActive(0);
                }}
                onKeyDown={move}
              />
              {search && (
                <button
                  type="button"
                  aria-label="清除资源搜索"
                  onClick={() => {
                    setSearch("");
                    setActive(0);
                    input.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
            </div>
            <div id={`${id}-list`} ref={list} role="listbox" aria-label={`${label}候选项`} className={styles.list}>
              {visible.map((option, index) => (
                <button
                  key={option.value}
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  tabIndex={-1}
                  className={index === activeIndex ? `${styles.option} ${styles.active}` : styles.option}
                  title={option.label}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(option.value)}
                >
                  <span>{option.label}</span>
                  <span aria-hidden="true">{option.value === value ? "✓" : ""}</span>
                </button>
              ))}
            </div>
            <p className={styles.note} role="status">
              {visible.length ? `${visible.length} 个选项 · ↑↓ 选择，Enter 确认` : "没有匹配的资源，试试其他名称"}
            </p>
          </div>
        )}
      </div>
    </fieldset>
  );
}
