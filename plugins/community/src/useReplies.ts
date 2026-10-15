import { useState } from "react";
import { type CommunityEntry, replyToEntry } from "./mock";

/** Entries plus per-entry reply drafts; the status line reports the last local action */
export function useReplies<T extends CommunityEntry>(initial: T[]) {
  const [entries, setEntries] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");

  /** Reload the local dataset while keeping demo replies */
  const refresh = () => {
    setEntries((current) => [...current]);
    setStatus("已刷新本地模拟数据");
  };

  /** Draft text of one entry; drafts never leak between entries */
  const draftOf = (id: string) => drafts[id] ?? "";

  /** Update one entry's draft */
  const setDraft = (id: string, value: string) => setDrafts((current) => ({ ...current, [id]: value }));

  /** Save the entry's draft as its reply and clear that draft */
  const sendReply = (entry: T) => {
    const content = draftOf(entry.id);
    if (!entry.canReply || entry.reply || !content.trim()) {
      return;
    }
    setEntries((current) => replyToEntry(current, entry.id, content));
    setDraft(entry.id, "");
    setStatus(`已为 ${entry.nickname} 记录本地模拟回复`);
  };

  const unreplied = entries.filter((entry) => !entry.reply).length;

  return { entries, unreplied, status, refresh, draftOf, setDraft, sendReply };
}
