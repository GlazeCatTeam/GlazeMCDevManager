import { Button, SegmentedControl } from "@glaze/plugin-sdk";
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { monthRangeError, todayKey } from "../data";
import styles from "./MonthRangePicker.module.css";

/** A year grid stages a single month or inclusive range until the user applies it */
export function MonthRangePicker({
  start,
  end,
  active,
  onChange,
}: {
  start: string;
  end: string;
  active: boolean;
  onChange: (start: string, end: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "range">("single");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [year, setYear] = useState(Number(todayKey().slice(0, 4)));
  const [cursor, setCursor] = useState("");
  const moveFocus = useRef(false);
  const latest = todayKey().slice(0, 7);
  const latestYear = Number(latest.slice(0, 4));
  const error = monthRangeError(first, last);
  const count =
    first && last && !error
      ? (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(last.slice(5)) - Number(first.slice(5)) + 1
      : 0;
  const years = [
    ...new Set([year, ...Array.from({ length: Math.min(31, latestYear) }, (_, index) => latestYear - index)]),
  ].sort((a, b) => b - a);

  useLayoutEffect(() => {
    if (!open) return;
    popup.current?.showPopover();
    /** Align the picker to its trigger's right edge while keeping it inside the viewport */
    const place = () => {
      if (!root.current || !popup.current) return;
      const anchor = root.current.getBoundingClientRect();
      // Rectangles include app CSS zoom; fixed offsets and size limits use layout pixels
      const scale = popup.current.offsetWidth
        ? popup.current.getBoundingClientRect().width / popup.current.offsetWidth
        : 1;
      popup.current.style.maxWidth = `${(window.innerWidth - 32) / scale}px`;
      popup.current.style.maxHeight = `${(window.innerHeight - 32) / scale}px`;
      const panel = popup.current.getBoundingClientRect();
      popup.current.style.left = `${Math.max(16, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - 16)) / scale}px`;
      popup.current.style.top = `${Math.max(16, Math.min(anchor.bottom + 8, window.innerHeight - panel.height - 16)) / scale}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const observer = new ResizeObserver(place);
    if (popup.current) observer.observe(popup.current);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    popup.current?.querySelector<HTMLButtonElement>("button[data-month][tabindex='0']")?.focus();
    /** Clicking outside discards the draft without changing the query */
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (!moveFocus.current) return;
    popup.current?.querySelector<HTMLButtonElement>(`button[data-month="${cursor}"]`)?.focus();
    moveFocus.current = false;
  }, [cursor]);

  /** Open an empty draft while retaining the last applied year and selection mode */
  const show = () => {
    const valid = active && !monthRangeError(start, end);
    const next = valid ? end : latest;
    setFirst("");
    setLast("");
    setMode(valid && start !== end ? "range" : "single");
    setYear(Number(next.slice(0, 4)));
    setCursor(next);
    setOpen(true);
  };

  /** Explicit dismissal returns keyboard focus to the entry */
  const close = () => {
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  };

  /** A single click selects one month; range endpoints may be picked in either order */
  const choose = (month: string) => {
    setCursor(month);
    if (mode === "single") {
      setFirst(month);
      setLast(month);
    } else if (!first || last) {
      setFirst(month);
      setLast("");
    } else {
      setFirst(month < first ? month : first);
      setLast(month < first ? first : month);
    }
  };

  /** Navigate the three-column grid across years without committing draft months */
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, month: string) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -3,
      ArrowDown: 3,
      PageUp: -12,
      PageDown: 12,
    };
    const date = new Date(`${month}-01T00:00:00Z`);
    if (event.key === "Home") date.setUTCMonth(0);
    else if (event.key === "End") date.setUTCMonth(11);
    else if (steps[event.key] !== undefined) date.setUTCMonth(date.getUTCMonth() + (steps[event.key] ?? 0));
    else return;
    event.preventDefault();
    const next = date.toISOString().slice(0, 7);
    if (next < "0001-01" || next > latest) return;
    moveFocus.current = true;
    setYear(Number(next.slice(0, 4)));
    setCursor(next);
  };

  /** Year browsing keeps the same calendar month where possible */
  const browseYear = (next: number) => {
    setYear(next);
    const nextMonth = `${String(next).padStart(4, "0")}-${cursor.slice(5) || "01"}`;
    setCursor(nextMonth > latest ? latest : nextMonth);
  };

  return (
    <fieldset
      ref={root}
      className={styles.root}
      aria-label="自选月份"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <Button
        size="xs"
        variant={active ? "primary" : "secondary"}
        aria-pressed={active}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => (open ? close() : show())}
      >
        自选月份
      </Button>
      {open && (
        <div
          ref={popup}
          id={`${id}-panel`}
          role="dialog"
          aria-label="选择统计月份"
          aria-describedby={`${id}-hint`}
          popover="manual"
          className={styles.popup}
        >
          <div className={styles.heading}>
            <strong>选择统计月份</strong>
            <span>最多 12 个月</span>
          </div>
          <SegmentedControl
            label="月份选择方式"
            options={[
              { value: "single", label: "单月" },
              { value: "range", label: "连续月份" },
            ]}
            value={mode}
            onChange={(value) => {
              setMode(value);
              setFirst("");
              setLast("");
            }}
          />
          <div className={styles.navigation}>
            <Button size="xs" aria-label="上一年" disabled={year <= 1} onClick={() => browseYear(year - 1)}>
              ‹
            </Button>
            <select aria-label="选择年份" value={year} onChange={(event) => browseYear(Number(event.target.value))}>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value} 年
                </option>
              ))}
            </select>
            <Button size="xs" aria-label="下一年" disabled={year >= latestYear} onClick={() => browseYear(year + 1)}>
              ›
            </Button>
          </div>
          <fieldset className={styles.months} aria-label={`${year} 年月份`}>
            {Array.from({ length: 12 }, (_, index) => {
              const month = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
              const endpoint = month === first || month === last;
              const inside = !!last && month > first && month < last;
              return (
                <Button
                  key={month}
                  size="sm"
                  variant={endpoint ? "primary" : "secondary"}
                  className={inside ? styles.inRange : undefined}
                  aria-label={`${year}年${index + 1}月`}
                  aria-pressed={endpoint || inside}
                  disabled={month > latest}
                  data-month={month}
                  tabIndex={month === cursor ? 0 : -1}
                  onKeyDown={(event) => navigate(event, month)}
                  onClick={() => choose(month)}
                >
                  {index + 1} 月
                </Button>
              );
            })}
          </fieldset>
          <div id={`${id}-hint`} className={styles.selection} role="status">
            <strong>
              {first ? `${first.replace("-", " 年 ")} 月` : "尚未选择"}
              {last && last !== first ? ` — ${last.replace("-", " 年 ")} 月` : ""}
            </strong>
            <span>
              {!first
                ? mode === "single"
                  ? "点击一个月份，再应用"
                  : "先选开始月份，再选结束月份，可跨年"
                : !last
                  ? "再选结束月份，可切换年份"
                  : (error ?? `已选 ${count} 个月 · 含起止月份`)}
            </span>
          </div>
          <div className={styles.actions}>
            <Button size="xs" onClick={close}>
              取消
            </Button>
            <Button
              size="xs"
              variant="primary"
              disabled={!!error}
              onClick={() => {
                onChange(first, last);
                close();
              }}
            >
              应用
            </Button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
