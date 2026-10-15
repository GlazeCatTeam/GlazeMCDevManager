import { avatarColorsFor, Button, Dialog, Notice, type RankEntry, remoteImageUrl } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./RankingCard.module.css";

/** Preview a real platform cover while leaving unavailable-image placeholders non-interactive */
export function RankingCover({ item }: { item: RankEntry }) {
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeAction = useRef<HTMLSpanElement>(null);
  const src = remoteImageUrl(item.iconUrl);
  const close = useCallback(() => {
    setPreview(false);
    trigger.current?.focus();
  }, []);

  // The preview has one action; keep keyboard navigation inside the modal
  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        closeAction.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview]);

  if (!src || failed) {
    const colors = avatarColorsFor(item.itemId ?? item.title);
    return (
      <span className={styles.cover} style={{ background: colors.face }} aria-hidden="true">
        <span className={styles.coverTop} style={{ background: colors.hair }} />
        <span className={styles.coverMark} style={{ background: colors.eyes }} />
      </span>
    );
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.coverButton}
        aria-label={`放大预览：${item.title}`}
        aria-haspopup="dialog"
        title="点击放大预览"
        onClick={() => {
          setPreviewFailed(false);
          setPreview(true);
        }}
      >
        <img
          className={styles.cover}
          src={src}
          alt=""
          width={28}
          height={28}
          decoding="async"
          loading="lazy"
          draggable={false}
          onError={() => {
            setFailed(true);
            setPreview(false);
          }}
        />
      </button>
      {preview && (
        <Dialog
          title={item.title}
          className={styles.coverDialog}
          onClose={close}
          actions={
            <span ref={closeAction}>
              <Button onClick={close}>关闭</Button>
            </span>
          }
        >
          {previewFailed ? (
            <Notice>图片加载失败，请关闭后重试</Notice>
          ) : (
            <img
              className={styles.coverPreview}
              src={src}
              alt={`${item.title} 封面`}
              draggable={false}
              onError={() => setPreviewFailed(true)}
            />
          )}
        </Dialog>
      )}
    </>
  );
}
