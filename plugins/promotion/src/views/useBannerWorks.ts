import { callHost } from "@glaze/plugin-sdk";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BannerWorkSearch, type SearchKind } from "./banner-work-search";

type SearchMode = "auto" | SearchKind;

/** Debounce account-owned searches while keeping selection and browse pages independent */
export function useBannerWorks(account: string, selectedId: string) {
  const model = useMemo(
    () =>
      new BannerWorkSearch((query, kind, page) =>
        query
          ? callHost("works.search", { account, query, kind, page, pageSize: 5 })
          : callHost("works.page", { account, page, pageSize: 5 }),
      ),
    [account],
  );
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const [search, setSearchText] = useState("");
  const [mode, setModeState] = useState<SearchMode>("auto");
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancel queued searches before starting another query or committing with Enter */
  function cancelTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  /** Interpret numeric input as a full ID unless the user explicitly chooses name search */
  function activate(value: string, nextMode: SearchMode) {
    cancelTimer();
    model.activate(value, nextMode === "auto" ? (/^\d{1,32}$/.test(value.trim()) ? "id" : "name") : nextMode);
  }
  /** Hide outdated results as soon as the input changes */
  function setSearch(value: string) {
    setSearchText(value);
    if (!composingRef.current) activate(value, mode);
  }
  /** Allow numeric titles to be searched explicitly as names */
  function setMode(value: SearchMode) {
    setModeState(value);
    activate(search, value);
  }
  /** Enter bypasses the debounce without issuing another request for an already loaded query */
  function searchNow() {
    cancelTimer();
    if (!composingRef.current) void model.start();
  }

  /** Suspend the debounce while a Chinese input method is composing text */
  function setComposition(value: boolean) {
    cancelTimer();
    composingRef.current = value;
    setComposing(value);
    if (!value) activate(search, mode);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing search mode must restart the debounce even when the text is unchanged
  useEffect(() => {
    if (composing) return;
    timer.current = setTimeout(() => void model.start(), search.trim() ? 300 : 0);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [model, search, mode, composing]);

  useEffect(() => {
    void model.ensureSelected(selectedId);
  }, [model, selectedId]);

  return {
    ...state,
    loading: state.loading || ((state.data === null || state.preview) && !state.error),
    searching:
      composing || Boolean(state.query && !state.error && (state.loading || state.preview || state.data === null)),
    hasMore: model.hasMore(),
    selectedWork: model.selected(selectedId),
    search,
    setSearch,
    mode,
    setMode,
    setComposing: setComposition,
    searchNow,
    loadMore: model.loadMore,
    reload: model.reload,
    saveScroll: model.saveScroll,
    getScroll: model.getScroll,
  };
}
