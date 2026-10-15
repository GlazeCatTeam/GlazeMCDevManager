import { Button, workScheduleTime } from "@glaze/plugin-sdk";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "./WorkSchedulePicker.module.css";

const dayMs = 86400_000;
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

/** Format platform wall-clock values independently of the computer's timezone */
export function beijingInput(time: number): string {
  return new Date(time + 8 * 3600_000).toISOString().slice(0, 16);
}

/** Pick a Beijing date and time without the operating system's calendar popup */
export function WorkSchedulePicker({
  value,
  onChange,
  now,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  now: number;
  disabled: boolean;
}) {
  const [date = "", clock = ""] = value.split("T");
  const [hour = "", minute = ""] = clock.split(":");
  const today = beijingInput(now).slice(0, 10);
  const dateValid = workScheduleTime(`${date} 00:00:00`) !== null;
  const [month, setMonth] = useState(() => (dateValid && date >= today ? date : today).slice(0, 7));
  const calendarRef = useRef<HTMLFieldSetElement>(null);
  const focusAfterSelection = useRef(false);
  useEffect(() => {
    if (dateValid && date >= today) setMonth(date.slice(0, 7));
  }, [date, dateValid, today]);
  useEffect(() => {
    if (!focusAfterSelection.current || date.slice(0, 7) !== month) return;
    const selected = calendarRef.current?.querySelector<HTMLButtonElement>("button[aria-pressed='true']");
    if (selected) {
      selected.focus();
      focusAfterSelection.current = false;
    }
  }, [date, month]);
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * dayMs;
  const timestamp = workScheduleTime(`${date} ${clock}:00`);
  const valid = timestamp !== null && timestamp > now;
  const tabDate =
    dateValid && date >= today && date.slice(0, 7) === month
      ? date
      : month === today.slice(0, 7)
        ? today
        : `${month}-01`;
  const summary = valid
    ? `${date.replaceAll("-", "/")} 周${weekdays[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]} ${clock}`
    : "请选择未来的有效日期和时间";

  /** Browse months without changing the selected appointment */
  const moveMonth = (offset: number) => {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + offset);
    setMonth(next.toISOString().slice(0, 7));
  };

  /** Resolve shortcuts at click time, using Beijing calendar days */
  const shortcut = (days: number) => {
    const current = Date.now();
    const next =
      days === 0 ? beijingInput(current + 3600_000) : `${beijingInput(current + days * dayMs).slice(0, 10)}T09:00`;
    setMonth(next.slice(0, 7));
    onChange(next);
  };

  /** Move the selected day with arrow keys while keeping the calendar to one Tab stop */
  const navigateDay = (event: KeyboardEvent<HTMLButtonElement>, day: string) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + offset * dayMs).toISOString().split("T")[0] ?? "";
    if (next < today || next > "9999-12-31") return;
    focusAfterSelection.current = true;
    onChange(`${next}T${clock}`);
  };

  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend>
        上架时间 <span className={styles.muted}>北京时间 UTC+8</span>
      </legend>
      <div className={styles.shortcuts}>
        <Button size="xs" onClick={() => shortcut(0)}>
          1 小时后
        </Button>
        <Button size="xs" onClick={() => shortcut(1)}>
          明天 09:00
        </Button>
        <Button size="xs" onClick={() => shortcut(2)}>
          后天 09:00
        </Button>
      </div>
      <div className={styles.calendar}>
        <div className={styles.navigation}>
          <Button
            size="xs"
            aria-label="上个月"
            disabled={disabled || month <= today.slice(0, 7)}
            onClick={() => moveMonth(-1)}
          >
            ‹
          </Button>
          <strong aria-live="polite">
            {Number(month.slice(0, 4))} 年 {Number(month.slice(5))} 月
          </strong>
          <Button size="xs" aria-label="下个月" disabled={disabled || month >= "9999-12"} onClick={() => moveMonth(1)}>
            ›
          </Button>
          <Button
            size="xs"
            onClick={() => {
              setMonth(today.slice(0, 7));
              onChange(`${today}T${clock}`);
            }}
          >
            今天
          </Button>
        </div>
        <fieldset ref={calendarRef} className={styles.days} aria-label="选择上架日期">
          {weekdays.map((day) => (
            <span className={styles.weekday} key={day}>
              {day}
            </span>
          ))}
          {Array.from({ length: 42 }, (_, index) => {
            const day = new Date(start + index * dayMs).toISOString().split("T")[0] ?? "";
            const selected = day === date;
            return (
              <Button
                key={day}
                size="xs"
                variant={selected ? "primary" : "secondary"}
                className={`${styles.day} ${day.slice(0, 7) !== month ? styles.outside : ""}`}
                aria-label={`${day}${day === today ? "，今天" : ""}`}
                aria-pressed={selected}
                aria-current={day === today ? "date" : undefined}
                tabIndex={day === tabDate ? 0 : -1}
                disabled={disabled || day < today || day > "9999-12-31"}
                onKeyDown={(event) => navigateDay(event, day)}
                onClick={() => onChange(`${day}T${clock}`)}
              >
                {Number(day.slice(-2))}
              </Button>
            );
          })}
        </fieldset>
      </div>
      <div className={styles.fields}>
        <label className={styles.dateField}>
          日期
          <input
            aria-label="上架日期"
            className={styles.input}
            type="text"
            placeholder="YYYY-MM-DD"
            maxLength={10}
            value={date}
            aria-invalid={!dateValid}
            onChange={(event) => onChange(`${event.target.value}T${clock}`)}
          />
        </label>
        <div className={styles.timeField}>
          <span>
            时间 <span className={styles.muted}>24 小时制</span>
          </span>
          <div className={styles.timeInputs}>
            <input
              aria-label="上架小时"
              className={styles.input}
              inputMode="numeric"
              placeholder="时"
              maxLength={2}
              value={hour}
              aria-invalid={!/^\d{1,2}$/.test(hour) || Number(hour) > 23}
              onChange={(event) => onChange(`${date}T${event.target.value}:${minute}`)}
              onBlur={() => onChange(`${date}T${hour ? hour.padStart(2, "0") : ""}:${minute}`)}
            />
            <span>:</span>
            <input
              aria-label="上架分钟"
              className={styles.input}
              inputMode="numeric"
              placeholder="分"
              maxLength={2}
              value={minute}
              aria-invalid={!/^\d{1,2}$/.test(minute) || Number(minute) > 59}
              onChange={(event) => onChange(`${date}T${hour}:${event.target.value}`)}
              onBlur={() => onChange(`${date}T${hour}:${minute ? minute.padStart(2, "0") : ""}`)}
            />
          </div>
        </div>
      </div>
      <div className={`${styles.summary} ${valid ? "" : styles.invalid}`} role="status">
        <span className={styles.muted}>{valid ? "将于北京时间" : "请检查上架时间"}</span>
        <strong>{summary}</strong>
      </div>
    </fieldset>
  );
}
