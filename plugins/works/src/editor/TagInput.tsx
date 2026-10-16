import { Button } from "@glaze/plugin-sdk";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import styles from "./TagInput.module.css";
import editorStyles from "./WorkEditor.module.css";

/** Keep tag suggestions inside the editor with bounded size and explicit dismissal */
export function TagInput({
  value,
  options,
  disabled,
  onChange,
  onAdd,
}: {
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
  onAdd: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [above, setAbove] = useState(false);
  const query = value.trim().toLowerCase();
  const matches = options.filter((option) => option.toLowerCase().includes(query)).slice(0, 20);
  const visible = open && !disabled && matches.length > 0;

  useLayoutEffect(() => {
    if (!visible || !root.current) return;
    const bounds = root.current.getBoundingClientRect();
    const below = window.innerHeight - bounds.bottom;
    setAbove(below < Math.min(240, window.innerHeight * 0.4) && bounds.top > below);
  }, [visible]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!visible) return;
    /** Dismiss on surrounding scroll, window blur or resize, while allowing list scrolling */
    const dismiss = (event: Event) => {
      if (event.type === "scroll" && event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [visible]);
  useEffect(() => {
    const option = list.current?.children[active] as HTMLElement | undefined;
    if (!visible || !option || !list.current) return;
    const bottom = option.offsetTop + option.offsetHeight;
    if (option.offsetTop < list.current.scrollTop) list.current.scrollTop = option.offsetTop;
    else if (bottom > list.current.scrollTop + list.current.clientHeight)
      list.current.scrollTop = bottom - list.current.clientHeight;
  }, [active, visible]);

  /** Choosing a suggestion fills the input; adding remains a separate user action */
  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className={styles.row}>
      <div className={styles.search} ref={root}>
        <input
          className={editorStyles.input}
          role="combobox"
          aria-label="搜索或输入模组标签"
          aria-autocomplete="list"
          aria-expanded={visible}
          aria-controls={visible ? id : undefined}
          aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder="搜索标签 / 输入自定义标签"
          onFocus={() => setOpen(!!query)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onChange(event.target.value);
            setActive(-1);
            setOpen(!!event.target.value.trim());
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
              event.preventDefault();
              setOpen(true);
              const direction = event.key === "ArrowDown" ? 1 : -1;
              setActive(
                visible && active >= 0
                  ? (active + direction + matches.length) % matches.length
                  : direction > 0
                    ? 0
                    : matches.length - 1,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (visible && active >= 0 && matches[active]) choose(matches[active]);
              else {
                setOpen(false);
                onAdd();
              }
            }
          }}
        />
        {visible && (
          <div className={styles.list} id={id} role="listbox" aria-label="模组标签建议" data-above={above} ref={list}>
            {matches.map((option, index) => (
              <button
                className={styles.option}
                key={option}
                id={`${id}-${index}`}
                type="button"
                role="option"
                aria-selected={active === index}
                tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
      <Button disabled={disabled || !value.trim()} onClick={onAdd}>
        添加
      </Button>
    </div>
  );
}
