import { Button } from "@glaze/plugin-sdk";
import type { FormEvent } from "react";
import { type CommunityEntry, MAX_REPLY_LENGTH } from "../mock";
import styles from "./ReplyEditor.module.css";

export interface ReplyEditorProps {
  entry: CommunityEntry;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}

/** Reply box pinned to the bottom of the detail panel; explains why replying is unavailable */
export function ReplyEditor({ entry, draft, onDraftChange, onSend }: ReplyEditorProps) {
  if (!entry.canReply || entry.reply) {
    return (
      <div className={styles.disabled}>
        {entry.reply ? "已回复此条记录" : (entry.blockedReason ?? "该记录暂不支持回复")}
        <span>本地模拟数据，不会发送到平台</span>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim()) {
      onSend();
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.inputRow}>
        <textarea
          aria-label={`回复${entry.nickname}`}
          placeholder="回复这条消息…"
          value={draft}
          maxLength={MAX_REPLY_LENGTH}
          rows={2}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <Button variant="primary" size="sm" type="submit" disabled={!draft.trim()}>
          发送
        </Button>
      </div>
      <div className={styles.hint}>
        <span>本地演示 · 回复不会发送到平台</span>
        <span>
          {draft.length} / {MAX_REPLY_LENGTH}
        </span>
      </div>
    </form>
  );
}
