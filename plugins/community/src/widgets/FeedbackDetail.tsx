import { Button, EmptyState, MAX_FEEDBACK_REPLY_LENGTH, type PlayerFeedback } from "@glaze/plugin-sdk";
import pageStyles from "../CommunityPage.module.css";
import styles from "./EntryDetail.module.css";
import { DeveloperResponse, EntryIdentity, ReplyStatus } from "./EntryMeta";
import { FeedbackAttachments } from "./FeedbackAttachments";
import { FeedbackBadge } from "./FeedbackBadge";
import replyStyles from "./ReplyEditor.module.css";

/** Show feedback with a full-width composer and an aligned footer, disabled while sending */
export function FeedbackDetail({
  entry,
  draft,
  onDraftChange,
  onSend,
  sending,
}: {
  entry: PlayerFeedback | undefined;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <section className={styles.panel} aria-label="反馈详情">
      {entry ? (
        <>
          <div className={styles.content}>
            <div className={pageStyles.detailHeading}>
              <FeedbackBadge type={entry.type} />
              <h2>{entry.nickname}</h2>
              <ReplyStatus entry={entry} />
            </div>
            <EntryIdentity entry={entry} />
            <p className={pageStyles.body}>{entry.content}</p>
            <FeedbackAttachments key={entry.id} feedback={entry} />
            <DeveloperResponse entry={entry} />
          </div>
          {!entry.canReply || entry.reply ? (
            <div className={replyStyles.disabled}>
              {entry.reply ? "已回复此条反馈" : (entry.blockedReason ?? "该反馈暂不支持回复")}
            </div>
          ) : (
            <form
              className={replyStyles.form}
              onSubmit={(event) => {
                event.preventDefault();
                if (!sending && draft.trim()) onSend();
              }}
            >
              <div className={replyStyles.inputRow}>
                <textarea
                  aria-label={`回复${entry.nickname}`}
                  placeholder="回复这条反馈…"
                  value={draft}
                  maxLength={MAX_FEEDBACK_REPLY_LENGTH}
                  rows={2}
                  disabled={sending}
                  onChange={(event) => onDraftChange(event.target.value)}
                />
              </div>
              <div className={replyStyles.footer}>
                <div className={replyStyles.hint}>
                  <span>回复将发送给玩家</span>
                  <span>
                    {draft.length} / {MAX_FEEDBACK_REPLY_LENGTH}
                  </span>
                </div>
                <Button variant="primary" size="sm" type="submit" disabled={sending || !draft.trim()}>
                  {sending ? "发送中…" : "发送"}
                </Button>
              </div>
            </form>
          )}
        </>
      ) : (
        <EmptyState title="暂无详情" hint="选择左侧反馈查看详情" />
      )}
    </section>
  );
}
