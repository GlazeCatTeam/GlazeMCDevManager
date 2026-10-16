import { Button } from "@glaze/plugin-sdk";
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { dateRangeError, shiftDay, todayKey } from "../data";
import styles from "./DateRangePicker.module.css";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

/** Stage an inclusive calendar interval; only confirmation changes the active query */
export function DateRangePicker({
  dates,
  active,
  onChange,
  includeToday = false,
}: {
  dates: string[];
  active: boolean;
  onChange: (start: string, end: string) => void;
  includeToday?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [cursor, setCursor] = useState("");
  const today = todayKey();
  const latest = includeToday ? today : shiftDay(today, -1);
  const error = includeToday && end > today ? "不能选择未来日期" : dateRangeError(start, end, shiftDay(latest, 1));
  const first = `${month}-01`;
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = shiftDay(first, -offset);

  useLayoutEffect(() => {
    if (!open) return;
    popup.current?.showPopover();
    /** Keep the floating calendar within narrow or short windows while its anchor scrolls */
    const place = () => {
      if (!root.current || !popup.current) return;
      const anchor = root.current.getBoundingClientRect();
      const panel = popup.current.getBoundingClientRect();
      popup.current.style.left = `${Math.max(16, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - 16))}px`;
      popup.current.style.top = `${Math.max(16, Math.min(anchor.bottom + 8, window.innerHeight - panel.height - 16))}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    popup.current?.querySelector<HTMLInputElement>("input")?.focus();
    /** Discard drafts when clicking outside the calendar */
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (!focusDay.current) return;
    popup.current?.querySelector<HTMLButtonElement>(`button[data-date="${cursor}"]`)?.focus();
    focusDay.current = false;
  }, [cursor]);

  /** Start an empty draft whenever the calendar is opened */
  const show = () => {
    const nextEnd = dates.at(-1) ?? latest;
    setStart("");
    setEnd("");
    setMonth(nextEnd.slice(0, 7));
    setCursor(nextEnd);
    setOpen(true);
  };

  /** Return focus to the calendar entry after confirmation, cancellation or Escape */
  const close = () => {
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };

  /** Browse a month without committing or changing draft endpoints */
  const moveMonth = (direction: number) => {
    const next = new Date(`${first}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + direction);
    const nextMonth = next.toISOString().slice(0, 7);
    setMonth(nextMonth);
    setCursor(nextMonth === latest.slice(0, 7) ? latest : `${nextMonth}-01`);
  };

  /** The first click starts a range; the second completes it in either direction */
  const choose = (date: string) => {
    if (end || !start) {
      setStart(date);
      setEnd("");
    } else {
      setStart(date < start ? date : start);
      setEnd(date < start ? start : date);
    }
    setCursor(date);
    setMonth(date.slice(0, 7));
  };

  /** Arrow keys move calendar focus across months without committing a range */
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = shiftDay(date, step);
    if (next < "0001-01-01" || next > latest) return;
    focusDay.current = true;
    setCursor(next);
    setMonth(next.slice(0, 7));
  };

  return (
    <fieldset
      ref={root}
      className={styles.root}
      aria-label="自定义周期"
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
        aria-controls={`${id}-calendar`}
        onClick={() => (open ? close() : show())}
      >
        自定义
      </Button>
      {open && (
        <div
          ref={popup}
          id={`${id}-calendar`}
          role="dialog"
          popover="manual"
          aria-label="自定义日期范围"
          className={styles.popup}
        >
          <div className={styles.fields}>
            <label>
              开始日期
              <input
                type="date"
                value={start}
                max={latest}
                aria-describedby={`${id}-hint`}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              结束日期
              <input
                type="date"
                value={end}
                max={latest}
                aria-describedby={`${id}-hint`}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </div>
          <div className={styles.navigation}>
            <Button size="xs" aria-label="上个月" disabled={month <= "0001-01"} onClick={() => moveMonth(-1)}>
              ‹
            </Button>
            <strong aria-live="polite">
              {Number(month.slice(0, 4))} 年 {Number(month.slice(5))} 月
            </strong>
            <Button size="xs" aria-label="下个月" disabled={month >= latest.slice(0, 7)} onClick={() => moveMonth(1)}>
              ›
            </Button>
          </div>
          <fieldset className={styles.days} aria-label="选择周期日期">
            {weekdays.map((day) => (
              <span key={day} className={styles.weekday}>
                {day}
              </span>
            ))}
            {Array.from({ length: 42 }, (_, index) => {
              const date = shiftDay(gridStart, index);
              const selected = date === start || date === end;
              const inRange = !!end && date > start && date < end;
              return (
                <Button
                  key={date}
                  size="xs"
                  variant={selected ? "primary" : "secondary"}
                  className={`${styles.day} ${date.slice(0, 7) !== month ? styles.outside : ""} ${inRange ? styles.inRange : ""}`}
                  data-date={date}
                  aria-label={date}
                  aria-pressed={selected || inRange}
                  tabIndex={date === cursor ? 0 : -1}
                  disabled={date > latest || date < "0001-01-01"}
                  onKeyDown={(event) => navigate(event, date)}
                  onClick={() => choose(date)}
                >
                  {Number(date.slice(-2))}
                </Button>
              );
            })}
          </fieldset>
          <p id={`${id}-hint`} className={styles.hint} role="status">
            {error ?? `已选择 ${start} — ${end}（含起止当天）`}
          </p>
          <span className={styles.note}>
            北京时间 · {includeToday ? "可含今天，当日未完结" : "截至昨天"} · 最多 366 天
          </span>
          <div className={styles.actions}>
            <Button size="xs" onClick={close}>
              取消
            </Button>
            <Button
              size="xs"
              variant="primary"
              disabled={!!error}
              onClick={() => {
                onChange(start, end);
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
