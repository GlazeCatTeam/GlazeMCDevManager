import { initializeWorkArchive, subscribeWorkArchive, workArchiveSnapshot } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useSyncExternalStore } from "react";

/** Route changes reuse the same verified archive state and do not block warm list data */
export function useWorkArchive(account: string) {
  const subscribe = useCallback((notify: () => void) => subscribeWorkArchive(account, notify), [account]);
  const snapshot = useCallback(() => workArchiveSnapshot(account), [account]);
  const state = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    void initializeWorkArchive(account).catch(() => {});
  }, [account]);
  const reload = useCallback(() => initializeWorkArchive(account, true), [account]);
  return { ...state, reload };
}
