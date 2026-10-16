import {
  Button,
  callHost,
  ImageCropDialog,
  Notice,
  TextButton,
  type WorkCrop,
  type WorkImageDraft,
} from "@glaze/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { BannerPreview } from "./BannerPreview";
import styles from "./BannerWorkspace.module.css";

/** Select any supported image, preview the crop and retain the previous image if replacement fails */
export function BannerImage({
  account,
  url,
  name,
  onChange,
  onBusy,
}: {
  account: string;
  url: string;
  name: string;
  onChange: (url: string, name: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [image, setImage] = useState<WorkImageDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const live = useRef(true);
  const token = useRef<string | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (token.current) void callHost("promotion.discardImage", { account, token: token.current }).catch(() => {});
    };
  }, [account]);

  /** Prepare locally; opening the file picker does not upload to the platform */
  async function choose() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const result = await callHost("promotion.prepareImage", { account });
      if (!live.current) {
        if (result.ok && result.value)
          void callHost("promotion.discardImage", { account, token: result.value.token }).catch(() => {});
        return;
      }
      if (!result.ok) setError(result.error.message);
      else if (result.value) {
        token.current = result.value.token;
        setImage(result.value);
        return;
      }
    } catch {
      if (live.current) setError("选图失败，请重试");
    } finally {
      pending.current = false;
      if (live.current) {
        setBusy(false);
        if (!token.current) onBusy(false);
      }
    }
  }
  /** Upload only the confirmed crop, preserving the old public image on errors */
  async function cropDone(crop: WorkCrop | null) {
    if (!image || pending.current) return;
    const selected = image;
    setImage(null);
    token.current = null;
    if (!crop) {
      void callHost("promotion.discardImage", { account, token: selected.token }).catch(() => {});
      onBusy(false);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await callHost("promotion.uploadImage", { account, token: selected.token, crop });
      if (!live.current) return;
      if (result.ok) onChange(result.value.url, result.value.name);
      else setError(result.error.message);
    } catch {
      if (live.current) setError("宣传图上传失败，请重新选择，原图已保留");
    } finally {
      pending.current = false;
      if (live.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }

  return (
    <div className={styles.imageSection}>
      <div className={styles.sectionTitle}>
        <h3>
          宣传图 <span className={styles.required}>必选</span>
        </h3>
        <span className={styles.muted}>940 × 450</span>
      </div>
      {url ? (
        <BannerPreview url={url} alt="轮播宣传图预览" />
      ) : (
        <button type="button" className={styles.pickImage} disabled={busy} onClick={() => void choose()}>
          <span className={styles.uploadMark}>＋</span>
          <strong>选择宣传图</strong>
          <span>选择后可拖动、缩放裁剪</span>
          <small>PNG / JPG · 10 MB 以内</small>
        </button>
      )}
      <div className={styles.inline}>
        {url && (
          <>
            <Button disabled={busy} onClick={() => void choose()}>
              更换宣传图
            </Button>
            <TextButton disabled={busy} onClick={() => onChange("", "")}>
              移除
            </TextButton>
          </>
        )}
        {busy && (
          <span className={styles.muted} role="status">
            正在处理图片…
          </span>
        )}
      </div>
      {name && <span className={styles.filename}>{name}</span>}
      <p className={styles.muted}>
        无需提前修改图片尺寸，确认裁剪后自动生成宣传图并上传。建议让主体居中，文字清晰可读。
      </p>
      {error && <Notice>{error}</Notice>}
      {image && <ImageCropDialog image={image} onDone={(crop) => void cropDone(crop)} />}
    </div>
  );
}
