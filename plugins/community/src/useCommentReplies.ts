import { callHost, MAX_COMMENT_REPLY_LENGTH, type PlayerComment } from "@glaze/plugin-sdk";
import { useEffect, useRef, useState } from "react";

type ReplyTarget = Pick<PlayerComment, "id" | "nickname" | "canReply" | "reply">;

/** Keep per-comment drafts and successful sends for the lifetime of the current account page */
export function useCommentReplies(account: string) {
  const [drafts, setDrafts] = useState(new Map<string, string>());
  const [replies, setReplies] = useState(new Map<string, string>());
  const [statuses, setStatuses] = useState(new Map<string, string>());
  const [sending, setSending] = useState<string | null>(null);
  const busy = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Preserve other drafts and prevent editing the content already being submitted */
  const setDraft = (id: string, content: string) => {
    if (busy.current !== id) setDrafts((current) => new Map(current).set(id, content));
  };

  /** Submit once, retain failed drafts and apply the result only to its original comment */
  const sendReply = async (entry: ReplyTarget, onSent: () => void) => {
    const draft = drafts.get(entry.id) ?? "";
    const content = draft.trim();
    if (
      !mounted.current ||
      busy.current ||
      !entry.canReply ||
      entry.reply ||
      replies.has(entry.id) ||
      !content ||
      draft.length > MAX_COMMENT_REPLY_LENGTH
    )
      return;
    busy.current = entry.id;
    setSending(entry.id);
    setStatuses((current) => new Map(current).set(entry.id, ""));
    try {
      const result = await callHost("comments.reply", { account, id: entry.id, content });
      if (!mounted.current) return;
      if (!result.ok) {
        const uncertain = ["network", "timeout", "internal"].includes(result.error.kind);
        setStatuses((current) =>
          new Map(current).set(
            entry.id,
            uncertain
              ? `回复结果未确认：${result.error.message}。草稿已保留，请刷新核实后再发送`
              : `回复失败：${result.error.message}。草稿已保留`,
          ),
        );
        return;
      }
      setReplies((current) => new Map(current).set(entry.id, content));
      setDrafts((current) => {
        const next = new Map(current);
        next.delete(entry.id);
        return next;
      });
      setStatuses((current) => new Map(current).set(entry.id, "回复发送成功"));
      onSent();
    } catch {
      if (mounted.current)
        setStatuses((current) => new Map(current).set(entry.id, "回复结果未确认，草稿已保留，请刷新核实后再发送"));
    } finally {
      busy.current = null;
      if (mounted.current) setSending(null);
    }
  };

  return {
    draftOf: (id: string) => drafts.get(id) ?? "",
    replyOf: (id: string) => replies.get(id),
    statusOf: (id: string) => statuses.get(id) ?? "",
    setDraft,
    sendReply,
    sending,
  };
}
