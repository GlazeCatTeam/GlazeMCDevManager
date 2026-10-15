import {
  avatarColorsFor,
  Button,
  EmptyState,
  Icon,
  Notice,
  Panel,
  type RankChange,
  type RankEntry,
  remoteImageUrl,
  TextButton,
  useHostQuery,
} from "@glaze/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { RANK_LIMIT, rankBoards, rankCategories } from "../boards";
import { useRankingLayout } from "../useRankingLayout";
import styles from "./RankingCard.module.css";

export interface RankingCardProps {
  className?: string | undefined;
  onOpenAll: () => void;
}

/** Text and style class for a rank change cell */
function describeChange(change: RankChange): { text: string; className: string | undefined } {
  switch (change.kind) {
    case "up":
      return { text: `▲ ${change.value}`, className: styles.up };
    case "down":
      return { text: `▼ ${change.value}`, className: styles.down };
    case "new":
      return { text: "NEW", className: styles.isNew };
    default:
      return { text: "—", className: styles.flat };
  }
}

/** Work icon from the platform; boards that send no icon, or a failed load, show a generated block */
function Cover({ item }: { item: RankEntry }) {
  const [failed, setFailed] = useState(false);
  const src = remoteImageUrl(item.iconUrl);
  if (src && !failed) {
    return <img className={styles.cover} src={src} alt="" draggable={false} onError={() => setFailed(true)} />;
  }
  const colors = avatarColorsFor(item.itemId ?? item.title);
  return (
    <span className={styles.cover} style={{ background: colors.face }} aria-hidden="true">
      <span className={styles.coverTop} style={{ background: colors.hair }} />
      <span className={styles.coverMark} style={{ background: colors.eyes }} />
    </span>
  );
}

/** Close a popover when the user clicks outside it or presses Escape */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/** Platform leaderboards with category tabs, sub-category chips and a tab layout picker */
export function RankingCard({ className, onOpenAll }: RankingCardProps) {
  const [category, setCategory] = useState(0);
  const [subCategory, setSubCategory] = useState(0);
  const layout = useRankingLayout();
  const shown = rankBoards.map(({ board }) => layout.boards.includes(board));
  const [popover, setPopover] = useState<"none" | "more" | "layout">("none");
  const toolbarRef = useDismiss(popover !== "none", () => setPopover("none"));

  const board = rankBoards[category]?.board ?? "pe_hot";
  const hasCategories = board !== "hot_search";
  const ranking = useHostQuery("rank.list", {
    board,
    category: rankCategories[subCategory]?.category ?? "mod",
    limit: RANK_LIMIT,
  });
  const items = ranking.data ?? [];
  const tabs = rankBoards.map(({ label }, index) => ({ label, index }));
  const visibleTabs = tabs.filter((tab) => shown[tab.index]);
  const hiddenTabs = tabs.filter((tab) => !shown[tab.index]);
  const activeHidden = !shown[category];

  const pickCategory = (index: number) => {
    setCategory(index);
    setPopover("none");
  };

  /** Keep one tab visible and persist changes through the host */
  const toggleShown = (index: number) => {
    if (layout.busy || (shown[index] && layout.boards.length === 1)) return;
    void layout.save(rankBoards.filter((_, i) => (i === index ? !shown[i] : shown[i])).map(({ board }) => board));
  };

  return (
    <Panel
      aria-label="排行榜"
      className={className ? `${styles.card} ${className}` : styles.card}
      title="排行榜"
      actions={
        <TextButton aria-label="刷新排行榜" onClick={ranking.reload} disabled={ranking.loading}>
          刷新
        </TextButton>
      }
    >
      <div className={styles.toolbar} ref={toolbarRef}>
        <div role="tablist" aria-label="榜单" className={styles.tabs}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.index}
              type="button"
              role="tab"
              aria-selected={tab.index === category}
              className={tab.index === category ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => pickCategory(tab.index)}
            >
              {tab.label}
            </button>
          ))}
          {hiddenTabs.length > 0 && (
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={popover === "more"}
              className={activeHidden ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setPopover(popover === "more" ? "none" : "more")}
            >
              {activeHidden ? `更多：${rankBoards[category]?.label ?? ""} ▾` : "更多 ▾"}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="调整默认显示的榜单"
          aria-haspopup="dialog"
          aria-expanded={popover === "layout"}
          className={
            popover === "layout"
              ? `${styles.chip} ${styles.chipActive} ${styles.layoutButton}`
              : `${styles.chip} ${styles.layoutButton}`
          }
          onClick={() => setPopover(popover === "layout" ? "none" : "layout")}
        >
          <Icon name="action.layout" size={16} />
          排版
        </button>

        {popover === "more" && (
          <div role="menu" aria-label="其他榜单" className={`${styles.popover} ${styles.menu}`}>
            {hiddenTabs.map((tab) => (
              <button
                key={tab.index}
                type="button"
                role="menuitem"
                className={tab.index === category ? `${styles.menuItem} ${styles.menuItemActive}` : styles.menuItem}
                onClick={() => pickCategory(tab.index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {popover === "layout" && (
          <div role="dialog" aria-label="调整默认显示的榜单" className={`${styles.popover} ${styles.layout}`}>
            <span className={styles.layoutTitle}>默认显示的榜单</span>
            <span className={styles.layoutHint}>勾选的直接显示，其余收进「更多」</span>
            <div className={styles.options}>
              {tabs.map((tab) => (
                <label key={tab.index} className={styles.option}>
                  <input
                    type="checkbox"
                    className={styles.nativeCheck}
                    checked={shown[tab.index] ?? false}
                    disabled={layout.busy || (shown[tab.index] && layout.boards.length === 1)}
                    onChange={() => toggleShown(tab.index)}
                  />
                  <span
                    className={shown[tab.index] ? `${styles.box} ${styles.boxChecked}` : styles.box}
                    aria-hidden="true"
                  >
                    {shown[tab.index] && <Icon name="action.check" size={10} />}
                  </span>
                  {tab.label}
                </label>
              ))}
            </div>
            <Button size="sm" onClick={() => setPopover("none")}>
              完成
            </Button>
          </div>
        )}
      </div>

      {hasCategories && (
        <div className={styles.chips}>
          {rankCategories.map(({ label }, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={index === subCategory}
              className={index === subCategory ? `${styles.chip} ${styles.chipActive}` : styles.chip}
              onClick={() => setSubCategory(index)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {layout.error && (
        <Notice
          action={
            <TextButton onClick={layout.retry} disabled={layout.busy}>
              重试读取排版
            </TextButton>
          }
        >
          {layout.error}
        </Notice>
      )}
      {ranking.error && (
        <Notice
          action={
            <TextButton tone="warning" onClick={ranking.reload}>
              重试
            </TextButton>
          }
        >
          榜单加载失败：{ranking.error.message}
        </Notice>
      )}
      {!ranking.loading && !ranking.error && items.length === 0 && <EmptyState title="这个榜单暂时没有作品" />}
      <ol
        className={styles.list}
        aria-label={`${rankBoards[category]?.label ?? ""}${hasCategories ? ` · ${rankCategories[subCategory]?.label ?? ""}` : ""}`}
        aria-busy={ranking.loading}
      >
        {items.map((item) => {
          const change = describeChange(item.change);
          return (
            <li key={`${item.rank}-${item.title}`} className={styles.item}>
              <span className={item.rank <= 3 ? `${styles.rank} ${styles.rankTop}` : styles.rank}>{item.rank}</span>
              {item.itemId !== null && <Cover key={item.iconUrl ?? item.itemId} item={item} />}
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={`${styles.change} ${change.className ?? ""}`}>{change.text}</span>
            </li>
          );
        })}
      </ol>

      <TextButton className={styles.all} onClick={onOpenAll}>
        查看全部榜单
      </TextButton>
    </Panel>
  );
}
