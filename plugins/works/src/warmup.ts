import { type AccountSummary, callHost, onHostEvent } from "@glaze/plugin-sdk";
import { clearWorkReads, preloadWorksPage } from "./useWorkQuery";

/** Warm one first page during idle time, entirely within the works plugin lifecycle */
export function startWorksWarmup(): () => void {
  if (typeof window === "undefined") return () => {};
  let disposed = false;
  let revision = 0;
  let initialized = false;
  let current: AccountSummary | null = null;
  let cancelScheduled: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let unsubscribeCache: (() => void) | undefined;

  /** Ignore routine same-account notifications; only identity/auth changes invalidate reads */
  const update = (account: AccountSummary | null) => {
    if (disposed) return;
    revision++;
    const changed = initialized && current?.id !== account?.id;
    const expired = account?.status === "expired" && current?.status !== "expired";
    const shouldWarm = account?.status === "active" && (!initialized || changed || current?.status !== "active");
    initialized = true;
    current = account;
    if (changed || expired) clearWorkReads();
    if (!shouldWarm || !account) return;
    cancelScheduled?.();
    const id = account.id;
    const preload = () => {
      if (!disposed && current?.id === id && current.status === "active") void preloadWorksPage(id);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(preload, { timeout: 1000 });
      cancelScheduled = () => window.cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(preload, 150);
      cancelScheduled = () => window.clearTimeout(handle);
    }
  };

  // The preload bridge is installed before this timer; no render or other plugin waits for it.
  const boot = window.setTimeout(() => {
    if (disposed) return;
    try {
      unsubscribe = onHostEvent("account.changed", (session) => update(session.current));
      unsubscribeCache = onHostEvent("cache.cleared", () => {
        cancelScheduled?.();
        clearWorkReads();
      });
      const expected = revision;
      void callHost("account.current")
        .then((result) => {
          if (!disposed && revision === expected && result.ok) update(result.value);
        })
        .catch(() => {});
    } catch {
      // Browser previews without a host can still render their loading state.
    }
  }, 0);

  /** Cancel queued work and subscriptions when the renderer goes away */
  const dispose = () => {
    disposed = true;
    window.clearTimeout(boot);
    cancelScheduled?.();
    unsubscribe?.();
    unsubscribeCache?.();
    clearWorkReads();
  };
  window.addEventListener("pagehide", dispose, { once: true });
  return dispose;
}
