import { EmptyState, Notice, Panel, type RankChange, TextButton } from "@glaze/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { RANK_LIMIT, rankBoards, rankCategories } from "../boards";
import { useRankingQuery } from "../useRankingQuery";
import styles from "./RankingCard.module.css";
import { RankingCover } from "./RankingCover";

const skeletonRanks = Array.from({ length: 8 }, (_, index) => index + 1);

export interface RankingCardProps {
  className?: string | undefined;
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

/** All leaderboard tabs scroll horizontally; real ranking pages append inside the fixed-height list */
export function RankingCard({ className }: RankingCardProps) {
  const [category, setCategory] = useState(0);
  const [subCategory, setSubCategory] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const endRef = useRef<HTMLLIElement>(null);

  const board = rankBoards[category]?.board ?? "pe_hot";
  const hasCategories = board !== "hot_search";
  const ranking = useRankingQuery(board, hasCategories ? (rankCategories[subCategory]?.category ?? "mod") : "mod");
  const items = ranking.items;

  // Use a non-passive wheel listener so a mouse wheel can pan the tab strip without moving the page
  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || tabs.scrollWidth <= tabs.clientWidth)
        return;
      event.preventDefault();
      tabs.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? tabs.clientWidth : 1);
    };
    tabs.addEventListener("wheel", onWheel, { passive: false });
    return () => tabs.removeEventListener("wheel", onWheel);
  }, []);

  // Fetch roughly one viewport ahead so normal scrolling rarely reaches an unloaded page
  useEffect(() => {
    const end = endRef.current;
    if (!end || ranking.loading || ranking.moreLoading || ranking.moreError || ranking.nextStart === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void ranking.loadMore();
      },
      { root: listRef.current, rootMargin: `0px 0px ${listRef.current?.clientHeight ?? 480}px 0px` },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [ranking.loading, ranking.moreLoading, ranking.moreError, ranking.nextStart, ranking.loadMore]);

  /** Warm the user's next tab without requesting every board and category */
  const preload = (index: number, subIndex = subCategory) => {
    const nextBoard = rankBoards[index]?.board ?? "pe_hot";
    ranking.prefetch({
      board: nextBoard,
      category: nextBoard === "hot_search" ? "mod" : (rankCategories[subIndex]?.category ?? "mod"),
      start: 0,
      limit: RANK_LIMIT,
      includeIcons: false,
    });
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
      <div role="tablist" aria-label="榜单" className={styles.tabs} ref={tabsRef}>
        {rankBoards.map(({ board: tabBoard, label }, index) => (
          <button
            key={tabBoard}
            type="button"
            role="tab"
            aria-selected={index === category}
            className={index === category ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setCategory(index)}
            onPointerEnter={() => preload(index)}
            onFocus={(event) => {
              preload(index);
              const tabs = tabsRef.current;
              if (tabs) {
                const left = event.currentTarget.offsetLeft;
                const right = left + event.currentTarget.offsetWidth;
                if (left < tabs.scrollLeft) tabs.scrollLeft = left;
                else if (right > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = right - tabs.clientWidth;
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className={styles.chips}
        style={{ visibility: hasCategories ? "visible" : "hidden" }}
        aria-hidden={!hasCategories}
      >
        {rankCategories.map(({ label }, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={index === subCategory}
            className={index === subCategory ? `${styles.chip} ${styles.chipActive}` : styles.chip}
            onClick={() => setSubCategory(index)}
            onPointerEnter={() => preload(category, index)}
            onFocus={() => preload(category, index)}
            tabIndex={hasCategories ? 0 : -1}
          >
            {label}
          </button>
        ))}
      </div>

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
      <div className={styles.listArea}>
        <span className={styles.status} role="status">
          {ranking.loading ? (ranking.data ? "正在更新…" : "正在加载榜单…") : ""}
        </span>
        <ol
          key={ranking.key}
          ref={listRef}
          className={styles.list}
          aria-label={`${rankBoards[category]?.label ?? ""}${hasCategories ? ` · ${rankCategories[subCategory]?.label ?? ""}` : ""}`}
          aria-busy={ranking.loading}
        >
          {!ranking.data &&
            ranking.loading &&
            skeletonRanks.map((rank) => (
              <li key={rank} className={styles.item} aria-hidden="true">
                <span className={styles.rank}>{rank}</span>
                {hasCategories && <span className={`${styles.cover} ${styles.skeleton}`} />}
                <span className={`${styles.skeletonTitle} ${styles.skeleton}`} />
              </li>
            ))}
          {!ranking.loading && !ranking.error && items.length === 0 && (
            <li>
              <EmptyState title="这个榜单暂时没有作品" />
            </li>
          )}
          {items.map((item) => {
            const change = describeChange(item.change);
            return (
              <li key={`${item.rank}-${item.itemId ?? item.title}`} className={styles.item}>
                <span className={item.rank <= 3 ? `${styles.rank} ${styles.rankTop}` : styles.rank}>{item.rank}</span>
                {item.itemId !== null && <RankingCover key={item.iconUrl ?? item.itemId} item={item} />}
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={`${styles.change} ${change.className ?? ""}`}>{change.text}</span>
              </li>
            );
          })}
          {ranking.data && (
            <li ref={endRef} className={styles.listEnd}>
              {ranking.moreError ? (
                <Notice action={<TextButton onClick={() => void ranking.loadMore()}>重试</TextButton>}>
                  {ranking.moreError.message}
                </Notice>
              ) : ranking.moreLoading ? (
                "正在加载更多…"
              ) : ranking.nextStart !== null ? (
                `已加载 ${items.length} 条，向下滚动继续`
              ) : (
                `已显示全部 ${items.length} 条`
              )}
            </li>
          )}
        </ol>
      </div>
    </Panel>
  );
}
