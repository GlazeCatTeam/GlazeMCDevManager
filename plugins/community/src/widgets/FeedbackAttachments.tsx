import { Button, Dialog, type PlayerFeedback, remoteImageUrl, Tag, TextButton, useHostQuery } from "@glaze/plugin-sdk";
import { type SyntheticEvent, useCallback, useState } from "react";
import styles from "./FeedbackAttachments.module.css";

type FeedbackImage = PlayerFeedback["images"][number];
type FeedbackLog = NonNullable<PlayerFeedback["log"]>;
type Preview = { kind: "image"; image: FeedbackImage } | { kind: "log"; log: FeedbackLog };

/** Decode off the rendering path and reveal the screenshot only when its pixels are ready */
function AttachmentImage({ image }: { image: FeedbackImage }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  /** Keep decoded pixels out of the first paint and ignore completion after the image unmounts */
  const showDecoded = async (event: SyntheticEvent<HTMLImageElement>) => {
    const element = event.currentTarget;
    try {
      await element.decode();
      if (element.isConnected) setState("ready");
    } catch {
      if (element.isConnected) setState("failed");
    }
  };

  return (
    <span className={styles.imageFrame} aria-busy={state === "loading"}>
      <img
        src={remoteImageUrl(image.url) ?? undefined}
        alt={image.name}
        decoding="async"
        className={state === "ready" ? undefined : styles.pendingImage}
        onLoad={showDecoded}
        onError={() => setState("failed")}
      />
      {state !== "ready" && (
        <span className={styles.imageStatus}>{state === "failed" ? "图片加载失败" : "图片加载中…"}</span>
      )}
    </span>
  );
}

/** Load text logs only when the user opens the attachment */
function LogPreview({ log }: { log: FeedbackLog }) {
  const query = useHostQuery("feedback.log", { url: log.url });
  if (query.loading) return <p role="status">正在加载日志…</p>;
  if (query.error)
    return (
      <div role="alert">
        {query.error.message} <TextButton onClick={query.reload}>重试</TextButton>
      </div>
    );
  return <pre className={styles.logPreview}>{query.data || "日志为空"}</pre>;
}

/** Show platform screenshots, text logs and structured conflict details */
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
                key={`${image.name}:${image.url}`}
                type="button"
                className={styles.thumbnail}
                aria-label={`查看${image.name}`}
                onClick={() => setPreview({ kind: "image", image })}
              >
                <AttachmentImage image={image} />
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
              <AttachmentImage key={preview.image.url} image={preview.image} />
            </div>
          ) : (
            <LogPreview key={preview.log.url} log={preview.log} />
          )}
        </Dialog>
      )}
    </>
  );
}
