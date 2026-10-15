import { Button, Dialog, Notice, TextButton, useHostQuery, type WorkSummary } from "@glaze/plugin-sdk";
import { formatDateTime } from "../format";
import styles from "./ReviewFeedbackDialog.module.css";

export interface ReviewFeedbackDialogProps {
  work: WorkSummary;
  onClose: () => void;
}

/** The latest review feedback of a work, loaded when the dialog opens */
export function ReviewFeedbackDialog({ work, onClose }: ReviewFeedbackDialogProps) {
  const feedback = useHostQuery("works.reviewFeedback", { itemId: work.itemId });

  return (
    <Dialog title={`「${work.name}」的审核反馈`} onClose={onClose} actions={<Button onClick={onClose}>关闭</Button>}>
      {feedback.error && (
        <Notice
          action={
            <TextButton tone="warning" onClick={feedback.reload}>
              重试
            </TextButton>
          }
        >
          加载失败：{feedback.error.message}
        </Notice>
      )}
      {feedback.loading && !feedback.data && <span className={styles.muted}>正在加载…</span>}
      {!feedback.loading && !feedback.error && feedback.data === null && (
        <span className={styles.muted}>这个作品暂时没有审核反馈</span>
      )}
      {feedback.data && (
        <div className={styles.feedback}>
          {feedback.data.time && <span className={styles.muted}>{formatDateTime(feedback.data.time)}</span>}
          <p className={styles.text}>{feedback.data.text}</p>
        </div>
      )}
    </Dialog>
  );
}
