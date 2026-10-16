import { Button, MAX_COMMENT_REPLY_LENGTH } from "@glaze/plugin-sdk";
import type { CommentEntry } from "../types";
import styles from "./ReplyEditor.module.css";

interface CommentReplyFormProps {
  entry: CommentEntry;
  draft: string;
  status: string;
  sending: string | null;
  onChange: (content: string) => void;
  onSend: () => void;
}

/** Show the account's reply state or a full-width composer with an aligned action footer */
export function CommentReplyForm({ entry, draft, status, sending, onChange, onSend }: CommentReplyFormProps) {
  if (!entry.canReply || entry.reply)
    return (
      <div className={styles.disabled}>
        <span role="status">{status || (entry.reply ? "当前账号已回复" : "当前账号已回复，平台未返回回复内容")}</span>
      </div>
    );
  const disabled = sending !== null || !draft.trim() || draft.length > MAX_COMMENT_REPLY_LENGTH;
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSend();
      }}
    >
      <div className={styles.inputRow}>
        <textarea
          aria-label={`回复${entry.nickname}`}
          placeholder="输入回复内容…"
          value={draft}
          maxLength={MAX_COMMENT_REPLY_LENGTH}
          rows={3}
          disabled={sending === entry.id}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className={styles.footer}>
        <div className={styles.hint}>
          <span>发送后将通知玩家</span>
          <span>
            {draft.length} / {MAX_COMMENT_REPLY_LENGTH}
          </span>
        </div>
        <Button variant="primary" type="submit" size="sm" disabled={disabled}>
          {sending === entry.id ? "发送中…" : "发送回复"}
        </Button>
      </div>
      {status && <p role="status">{status}</p>}
    </form>
  );
}
