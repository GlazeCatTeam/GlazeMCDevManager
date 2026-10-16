import {
  Button,
  callHost,
  Dialog,
  hasPromotionIntro,
  Notice,
  type PromotionActivity,
  type PromotionModule,
  type PromotionWork,
  RichEditor,
  type WorkUpload,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { Uploads } from "../shared";
import styles from "./ActivityApplicationDialog.module.css";

/** Keep one selected work's draft and uncertain submission state across dialog closes */
export function ActivityApplicationDialog({
  account,
  activity,
  module,
  work,
  open,
  disabled,
  onClose,
  onSuccess,
}: {
  account: string;
  activity: PromotionActivity;
  module: PromotionModule;
  work: PromotionWork;
  open: boolean;
  disabled: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [intro, setIntro] = useState("");
  const [images, setImages] = useState<(WorkUpload | null)[]>([]);
  const [videos, setVideos] = useState<(WorkUpload | null)[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [introBusy, setIntroBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const busy = imageBusy || videoBusy || introBusy || submitting;
  const blocked = disabled || busy || uncertain;
  const valid = hasPromotionIntro(intro) && intro.length <= 10000;

  // Keep keyboard navigation inside the application or its nested link dialog
  useEffect(() => {
    if (!open) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = content.current?.querySelector('[role="dialog"]') ?? content.current?.closest('[role="dialog"]');
      const controls = Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [open]);

  /** Leave nested link dialogs to handle Escape and prevent dismissal during a write */
  const close = useCallback(() => {
    if (busy || pending.current || content.current?.querySelector('[role="dialog"]')) return;
    closeCallback.current();
  }, [busy]);

  /** Reuse the host upload pipeline for images embedded in the introduction */
  async function uploadIntroImage(): Promise<WorkUpload | null> {
    if (blocked) return null;
    setIntroBusy(true);
    setError("");
    try {
      const result = await callHost("promotion.upload", { account, kind: "image" });
      if (!result.ok) {
        setError(result.error.message);
        return null;
      }
      return result.value;
    } catch {
      setError("图片上传失败，请重试");
      return null;
    } finally {
      setIntroBusy(false);
    }
  }

  /** Submit the visible application once and require record verification after uncertain results */
  async function submit() {
    if (pending.current || blocked || !valid) return;
    pending.current = true;
    setSubmitting(true);
    setError("");
    try {
      const result = await callHost("promotion.join", {
        account,
        kind: "review",
        activityId: activity.id,
        moduleId: module.id,
        itemIds: [work.id],
        intro,
        discount: 0,
        partitionId: "",
        images: images.flatMap((file) => (file ? [file.receipt] : [])),
        videos: videos.flatMap((file) => (file ? [file.receipt] : [])),
      });
      if (result.ok) onSuccess();
      else {
        const unknown = ["network", "timeout", "parse", "internal"].includes(result.error.kind);
        setUncertain(unknown);
        setError(
          unknown
            ? `${result.error.message}。提交结果未确认，请返回并刷新报名记录核对，避免重复提交。`
            : result.error.message,
        );
      }
    } catch {
      setUncertain(true);
      setError("提交结果未确认，请返回并刷新报名记录核对，避免重复提交。");
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  if (!open) return null;
  return (
    <Dialog
      title="添加申请"
      className={styles.dialog}
      onClose={close}
      actions={
        <div className={styles.footer}>
          {error && <Notice>{error}</Notice>}
          <div className={styles.actions}>
            <span>
              图片 {images.filter(Boolean).length} 张 · 视频 {videos.filter(Boolean).length} 个
            </span>
            <Button disabled={busy} onClick={close}>
              返回
            </Button>
            <Button variant="primary" disabled={blocked || !valid} onClick={() => void submit()}>
              {submitting ? "正在提交…" : "确认提交"}
            </Button>
          </div>
        </div>
      }
    >
      <button className={styles.close} type="button" aria-label="关闭申请" disabled={busy} onClick={close}>
        ×
      </button>
      <div className={styles.content} ref={content}>
        <p className={styles.context}>
          {activity.name} · {module.name}
        </p>
        <p className={styles.agreement}>您正选中资源「{work.name}」参加本次活动，点击确认即代表您同意参加本次活动。</p>
        <div className={styles.field}>
          <span className={styles.label}>
            <span className={styles.required}>*</span> 作品介绍
          </span>
          <div className={styles.editor}>
            <RichEditor
              label="作品介绍"
              required
              value={intro}
              onChange={setIntro}
              disabled={blocked}
              upload={uploadIntroImage}
              maxLength={10000}
              placeholder="在这里输入内容"
              showPreview={false}
            />
            {!hasPromotionIntro(intro) && <span className={styles.required}>请输入作品介绍</span>}
            {intro.length > 10000 && <span className={styles.required}>作品介绍内容过长，请精简后再提交。</span>}
          </div>
        </div>
        <Uploads
          className={styles.field}
          account={account}
          files={images}
          onChange={setImages}
          onBusy={setImageBusy}
          disabled={blocked}
        />
        <Uploads
          className={styles.field}
          account={account}
          kind="video"
          files={videos}
          onChange={setVideos}
          onBusy={setVideoBusy}
          disabled={blocked}
        />
      </div>
    </Dialog>
  );
}
