import {
  callHost,
  type MessageContent,
  type MessageListParams,
  type MessagePage,
  type MessageSummary,
  type MessageType,
  onHostEvent,
  QueryCache,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 20;
// First pages survive page switches so returning to the mailbox shows rows at once
const firstPages = new QueryCache<MessagePage>({ ttl: 30_000, capacity: 20, errorMessage: "消息加载失败，请重试" });
const changeListeners = new Set<() => void>();
let listening = false;

/** Drop cached first pages when messages change elsewhere, e.g. read or deleted by an AI tool */
function listenForChanges(): void {
  if (listening) return;
  try {
    onHostEvent("data.changed", ({ modules }) => {
      if (!modules.includes("messages")) return;
      firstPages.invalidate();
      for (const notify of changeListeners) notify();
    });
    listening = true;
  } catch {
    // Outside the app window there is no host to report changes
  }
}

/** Own account-scoped mailbox requests; ignore stale responses and serialize mutations */
export function useMessages(account: string, filters: Omit<MessageListParams, "account" | "start" | "span">) {
  const [page, setPage] = useState<MessagePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<MessageSummary>();
  const [content, setContent] = useState<MessageContent>();
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offset = useRef(0);
  const generation = useRef(0);
  const alive = useRef(true);
  const locked = useRef(false);
  const filterKey = JSON.stringify(filters);
  const currentKey = useRef(filterKey);
  currentKey.current = filterKey;
  const cacheKey = JSON.stringify([account, filterKey]);
  const mounted = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);

  /** Refresh a page or append the next offset, retaining loaded rows when a request fails; cached reuses a fresh first page */
  const load = useCallback(
    async (append = false, cached = false) => {
      const request = ++generation.current;
      const start = append ? offset.current : 0;
      setLoading(true);
      setError("");
      try {
        const fetch = () => callHost("messages.list", { ...JSON.parse(filterKey), account, start, span: PAGE_SIZE });
        if (!append && !cached) firstPages.invalidate(cacheKey);
        const result = append ? await fetch() : await firstPages.read(cacheKey, fetch);
        if (!alive.current || request !== generation.current || currentKey.current !== filterKey) return;
        if (result.ok) {
          const received = result.value;
          offset.current = start + received.messages.length;
          setHasMore(received.messages.length >= PAGE_SIZE && offset.current < received.total);
          setPage((previous) => {
            const rows = append ? [...(previous?.messages ?? []), ...received.messages] : received.messages;
            return { ...received, messages: [...new Map(rows.map((row) => [row.id, row])).values()] };
          });
        } else setError(result.error.message);
      } catch {
        if (alive.current && request === generation.current) setError("消息加载失败，请重试");
      } finally {
        if (alive.current && request === generation.current) setLoading(false);
      }
    },
    [account, filterKey, cacheKey],
  );

  // Mounted mailboxes reload in place; cached rows stay visible until the new page arrives
  useEffect(() => {
    listenForChanges();
    const notify = () => {
      if (!locked.current) void load(false, true);
    };
    changeListeners.add(notify);
    return () => {
      changeListeners.delete(notify);
    };
  }, [load]);

  useEffect(() => {
    const cached = firstPages.peek(cacheKey);
    setPage(cached);
    setSelected(undefined);
    setContent(undefined);
    setDetailError("");
    setHasMore(!!cached && cached.messages.length >= PAGE_SIZE && cached.messages.length < cached.total);
    setNotice("");
    offset.current = cached?.messages.length ?? 0;
    setLoading(!cached);
    // Only typing in filters is debounced; entering the page or a cached view loads at once
    const delay = cached || !mounted.current ? 0 : 250;
    mounted.current = true;
    const timer = setTimeout(() => {
      if (!firstPages.fresh(cacheKey)) void load(false, true);
    }, delay);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [load, cacheKey]);

  /** Open an explicit selection; acknowledge its implicit read only after detail succeeds */
  const open = async (id: string) => {
    if (locked.current || loading) return;
    const message = page?.messages.find((row) => row.id === id) ?? (selected?.id === id ? selected : undefined);
    if (!message) return;
    locked.current = true;
    setBusy(true);
    setSelected(message);
    setContent(undefined);
    setDetailLoading(true);
    setDetailError("");
    setNotice("");
    try {
      const result = await callHost("messages.get", { account, id });
      if (!alive.current) return;
      if (result.ok) {
        setContent(result.value);
        setDetailLoading(false);
        firstPages.expire();
        setSelected({ ...message, read: true });
        setPage((previous) => {
          if (!previous) return previous;
          const unreadByType = { ...previous.unreadByType };
          const unread = unreadByType[message.type as MessageType];
          if (!message.read && typeof unread === "number")
            unreadByType[message.type as MessageType] = Math.max(0, unread - 1);
          return {
            ...previous,
            unread: previous.unread === null ? null : Math.max(0, previous.unread - Number(!message.read)),
            unreadByType,
            messages: previous.messages.map((row) => (row.id === id ? { ...row, read: true } : row)),
          };
        });
        // A read filter changes list membership and offsets; other views retain their loaded pages
        if (filters.read === false) await load();
      } else setDetailError(result.error.message);
    } catch {
      if (alive.current) setDetailError("消息详情加载失败，请重试");
    } finally {
      locked.current = false;
      if (alive.current) {
        setBusy(false);
        setDetailLoading(false);
      }
    }
  };

  /** Submit a single explicit mutation and reload authoritative counts after success */
  const mutate = async (ids?: string[]): Promise<boolean> => {
    if (locked.current || loading) return false;
    locked.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const result = ids
        ? await callHost("messages.delete", { account, ids })
        : await callHost("messages.markAllRead", { account });
      if (!alive.current) return false;
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      if (ids?.includes(selected?.id ?? "")) {
        setSelected(undefined);
        setContent(undefined);
        setDetailError("");
      }
      setPage((previous) =>
        previous
          ? {
              ...previous,
              unread: ids ? null : 0,
              unreadByType: Object.fromEntries(
                Object.keys(previous.unreadByType).map((type) => [type, ids ? null : 0]),
              ) as MessagePage["unreadByType"],
              total: ids
                ? Math.max(0, previous.total - previous.messages.filter((row) => ids.includes(row.id)).length)
                : previous.total,
              messages: ids
                ? previous.messages.filter((row) => !ids.includes(row.id))
                : previous.messages.map((row) => ({ ...row, read: true })),
            }
          : previous,
      );
      setNotice(ids ? `已删除 ${ids.length} 条消息` : "已将账号内全部消息标记为已读");
      await load();
      return true;
    } catch {
      if (alive.current) setError("操作未能确认完成，请刷新消息后重试");
      return false;
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return {
    page,
    loading,
    busy,
    error,
    notice,
    selected,
    content,
    detailError,
    detailLoading,
    hasMore,
    load,
    open,
    mutate,
  };
}
