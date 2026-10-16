import { callHost, type FeedbackTypeCode, MAX_FEEDBACK_REPLY_LENGTH, type PlayerFeedback } from "@glaze/plugin-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { type FeedbackReplyFilter, filterFeedbackPage, loadAllFeedback } from "./feedback-query";
import { createFeedbackLoader } from "./feedback-requests";

export const FEEDBACK_PER_PAGE = 20;
// Last result per query so returning to the page shows rows at once while they refresh
const lastStates = new Map<string, FeedbackState>();

interface FeedbackState {
  key: string;
  entries: PlayerFeedback[];
  total: number;
  page: number;
}

/** Filter complete feedback queries before paging, retaining refresh results and ignoring obsolete reads */
export function useFeedback(
  account: string,
  type: FeedbackTypeCode | "全部",
  search: string,
  page: number,
  replyFilter: FeedbackReplyFilter,
) {
  const filtered = replyFilter !== "全部";
  const sourcePage = filtered ? -1 : page;
  const key = JSON.stringify([account, type, search, filtered]);
  const requestKey = JSON.stringify([key, sourcePage]);
  const [state, setState] = useState<FeedbackState>(
    () => lastStates.get(requestKey) ?? { key: "", entries: [], total: 0, page: -1 },
  );
  const [loading, setLoading] = useState(() => !lastStates.has(requestKey));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [load] = useState(() => createFeedbackLoader((params) => callHost("feedback.list", params)));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const request = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const activeKey = useRef(requestKey);
  activeKey.current = requestKey;

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
    const params = {
      account,
      start: filtered ? 0 : sourcePage * FEEDBACK_PER_PAGE,
      span: FEEDBACK_PER_PAGE,
      ...(type === "全部" ? {} : { type }),
      ...(search ? { search } : {}),
    };
    const active = () => request.current === token && activeKey.current === requestKey;
    const result = filtered ? loadAllFeedback(params, load, active) : load(params);
    result
      .then((result) => {
        if (!active() || !result) return;
        if (result.ok) {
          const next = { key, entries: result.value.entries, total: result.value.total, page: sourcePage };
          lastStates.delete(requestKey);
          lastStates.set(requestKey, next);
          while (lastStates.size > 20) lastStates.delete(lastStates.keys().next().value as string);
          setState(next);
        } else setError(result.error.message);
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
  }, [account, key, requestKey, sourcePage, filtered, type, search, version, load]);

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
  const data = useMemo(() => {
    if (state.key !== key) return { entries: [], total: 0 };
    const entries = state.entries.map((entry) => {
      const content = Object.hasOwn(replies, entry.id) ? replies[entry.id] : undefined;
      return content ? { ...entry, canReply: false, reply: { content, createdAt: "" } } : entry;
    });
    return filtered
      ? filterFeedbackPage(entries, replyFilter, page, FEEDBACK_PER_PAGE)
      : { entries: state.page === page ? entries : [], total: state.total };
  }, [state, key, page, filtered, replyFilter, replies]);
  /** Explicit refresh always revalidates; pending identical requests are shared */
  const refresh = () => setVersion((value) => value + 1);
  return {
    entries: data.entries,
    total: data.total,
    loading: loading || (!error && (state.key !== key || state.page !== sourcePage)),
    error,
    refresh,
    retry: refresh,
    draftOf,
    setDraft,
    sendReply,
    sending,
    status,
  };
}
