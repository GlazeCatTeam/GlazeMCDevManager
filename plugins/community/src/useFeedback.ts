import { callHost, type FeedbackTypeCode, MAX_FEEDBACK_REPLY_LENGTH, type PlayerFeedback } from "@glaze/plugin-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFeedbackLoader } from "./feedback-requests";

interface FeedbackState {
  key: string;
  entries: PlayerFeedback[];
  total: number;
  nextStart: number;
  ended: boolean;
}

/** Refresh account-scoped feedback in place, sharing pending reads and discarding stale responses */
export function useFeedback(account: string, type: FeedbackTypeCode | "全部", search: string) {
  const key = JSON.stringify([account, type, search]);
  const [state, setState] = useState<FeedbackState>({ key: "", entries: [], total: 0, nextStart: 0, ended: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [load] = useState(() => createFeedbackLoader((params) => callHost("feedback.list", params)));
  const [failedAction, setFailedAction] = useState<"refresh" | "more">("refresh");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const request = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const activeKey = useRef(key);
  activeKey.current = key;

  /** Opaque platform ids must not resolve inherited object properties */
  const draftOf = (id: string) => (Object.hasOwn(drafts, id) ? (drafts[id] ?? "") : "");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);

  useEffect(() => {
    void version;
    const token = ++request.current;
    setLoading(true);
    setError("");
    setFailedAction("refresh");
    setState((current) => (current.key === key ? current : { key, entries: [], total: 0, nextStart: 0, ended: false }));
    load({
      account,
      start: 0,
      span: 20,
      ...(type === "全部" ? {} : { type }),
      ...(search ? { search } : {}),
    })
      .then((result) => {
        if (request.current !== token || activeKey.current !== key) return;
        if (result.ok)
          setState({
            key,
            entries: result.value.entries,
            total: result.value.total,
            nextStart: result.value.entries.length,
            ended: result.value.entries.length === 0 || result.value.entries.length >= result.value.total,
          });
        else setError(result.error.message);
      })
      .catch(() => {
        if (request.current === token) setError("反馈加载失败，请重试");
      })
      .finally(() => {
        if (request.current === token) setLoading(false);
      });
    return () => {
      request.current++;
    };
  }, [account, key, type, search, version, load]);

  /** Append a platform page and deduplicate rows when new feedback shifts offsets */
  const loadMore = async () => {
    if (loading || state.key !== key || state.ended) return;
    const token = ++request.current;
    setLoading(true);
    setError("");
    setFailedAction("more");
    try {
      const result = await load({
        account,
        start: state.nextStart,
        span: 20,
        ...(type === "全部" ? {} : { type }),
        ...(search ? { search } : {}),
      });
      if (request.current !== token || activeKey.current !== key) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const nextStart = state.nextStart + result.value.entries.length;
      setState((current) => ({
        key,
        entries: [...new Map([...current.entries, ...result.value.entries].map((entry) => [entry.id, entry])).values()],
        total: result.value.total,
        nextStart,
        ended: result.value.entries.length === 0 || nextStart >= result.value.total,
      }));
    } catch {
      if (request.current === token) setError("反馈加载失败，请重试");
    } finally {
      if (request.current === token) setLoading(false);
    }
  };

  /** Submit once and update the original account's record only after confirmed success */
  const sendReply = async (entry: PlayerFeedback) => {
    const content = draftOf(entry.id).trim();
    if (busy.current || !entry.canReply || entry.reply || !content || content.length > MAX_FEEDBACK_REPLY_LENGTH)
      return;
    busy.current = true;
    setSending(entry.id);
    setStatus("");
    try {
      const result = await callHost("feedback.reply", { account, id: entry.id, content });
      if (!mounted.current) return;
      if (!result.ok) {
        setStatus(`回复失败：${result.error.message}`);
        return;
      }
      setReplies((current) => ({ ...current, [entry.id]: content }));
      setDrafts((current) => ({ ...current, [entry.id]: "" }));
      setStatus(`已回复 ${entry.nickname}`);
    } catch {
      if (mounted.current) setStatus("回复结果未确认，请刷新核实后再操作；草稿已保留");
    } finally {
      busy.current = false;
      if (mounted.current) setSending(null);
    }
  };

  /** Store a separate draft for each feedback */
  const setDraft = (id: string, text: string) => setDrafts((current) => ({ ...current, [id]: text }));
  const entries = useMemo(
    () =>
      state.key === key
        ? state.entries.map((entry) => {
            const content = Object.hasOwn(replies, entry.id) ? replies[entry.id] : undefined;
            return content ? { ...entry, canReply: false, reply: { content, createdAt: "" } } : entry;
          })
        : [],
    [state.key, state.entries, key, replies],
  );
  /** Explicit refresh always revalidates; pending identical requests are shared */
  const refresh = () => setVersion((value) => value + 1);
  return {
    entries,
    total: state.key === key ? state.total : 0,
    hasMore: state.key === key && !state.ended && state.nextStart > 0,
    loading: loading || state.key !== key,
    error,
    refresh,
    retry: failedAction === "more" ? loadMore : refresh,
    loadMore,
    draftOf,
    setDraft,
    sendReply,
    sending,
    status,
  };
}
