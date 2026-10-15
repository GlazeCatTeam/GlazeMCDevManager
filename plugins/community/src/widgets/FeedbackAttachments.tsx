import { Button, Dialog, Tag, TextButton } from "@glaze/plugin-sdk";
import { useCallback, useState } from "react";
import type { FeedbackImage, FeedbackLog, PlayerFeedback } from "../mock";
import styles from "./FeedbackAttachments.module.css";

type Preview = { kind: "image"; image: FeedbackImage } | { kind: "log"; log: FeedbackLog };

/** Placeholder artwork for a demo screenshot attachment */
function AttachmentArtwork({ image }: { image: FeedbackImage }) {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-label={`${image.name}，模拟附件`}>
      <title>{image.name}</title>
      <rect width="160" height="100" fill="var(--g-surface-app)" />
      <path d="M0 0h130L30 100H0z" fill={image.color} />
    </svg>
  );
}

/** Screenshots, log file and conflicting mods of one feedback, each openable in a preview dialog */
export function FeedbackAttachments({ feedback }: { feedback: PlayerFeedback }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const { images, log, conflicts } = feedback;

  return (
    <>
      {images.length > 0 && (
        <section className={styles.group}>
          <h3>
            附件图片 <span className={styles.count}>({images.length})</span>
          </h3>
          <div className={styles.images}>
            {images.map((image) => (
              <button
                key={image.name}
                type="button"
                className={styles.thumbnail}
                aria-label={`查看${image.name}`}
                onClick={() => setPreview({ kind: "image", image })}
              >
                <AttachmentArtwork image={image} />
              </button>
            ))}
          </div>
        </section>
      )}
      {log && (
        <div className={styles.logFile}>
          <strong>日志文件</strong>
          <span>{log.name}</span>
          <TextButton onClick={() => setPreview({ kind: "log", log })}>查看</TextButton>
        </div>
      )}
      {conflicts.length > 0 && (
        <section className={styles.group}>
          <h3>冲突模组</h3>
          <div className={styles.tags}>
            {conflicts.map((conflict) => (
              <Tag key={conflict} tone="warning">
                {conflict}
              </Tag>
            ))}
          </div>
        </section>
      )}
      {preview && (
        <Dialog
          title={preview.kind === "image" ? preview.image.name : preview.log.name}
          onClose={closePreview}
          actions={<Button onClick={closePreview}>关闭</Button>}
        >
          {preview.kind === "image" ? (
            <div className={styles.imagePreview}>
              <AttachmentArtwork image={preview.image} />
              <span>模拟附件预览</span>
            </div>
          ) : (
            <pre className={styles.logPreview}>{preview.log.content}</pre>
          )}
        </Dialog>
      )}
    </>
  );
}
