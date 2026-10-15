import { Button, Dialog, type WorkCrop, type WorkImageDraft } from "@glaze/plugin-sdk";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import styles from "./ImageCropDialog.module.css";

type View = { zoom: number; x: number; y: number };

/** Keep the aspect-locked source rectangle inside the original image */
function cropFor(image: WorkImageDraft, view: View): WorkCrop {
  const ratio = image.targetWidth / image.targetHeight;
  const width = Math.max(1, Math.floor(Math.min(image.width, image.height * ratio) / view.zoom));
  const height = Math.max(1, Math.min(image.height, Math.round(width / ratio)));
  return {
    width,
    height,
    x: Math.round(Math.max(0, Math.min(image.width - width, view.x - width / 2))),
    y: Math.round(Math.max(0, Math.min(image.height - height, view.y - height / 2))),
  };
}

/** Move and resize the crop with pointers; encoding and upload remain in the host */
export function ImageCropDialog({ image, onDone }: { image: WorkImageDraft; onDone: (crop: WorkCrop | null) => void }) {
  const [view, setView] = useState<View>({ zoom: 1, x: image.width / 2, y: image.height / 2 });
  const preview = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; crop: WorkCrop; scaleX: number; scaleY: number } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const close = useCallback(() => onDone(null), [onDone]);
  useEffect(() => {
    const bytes = Uint8Array.from(atob(image.preview), (c) => c.charCodeAt(0));
    const local = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    setUrl(local);
    return () => URL.revokeObjectURL(local);
  }, [image.preview]);
  useEffect(() => {
    const node = preview.current;
    if (!node) return;
    /** Consume wheel movement locally and keep the current crop center while scaling */
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (drag.current) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      setView((current) => {
        const crop = cropFor(image, current);
        return {
          zoom: Math.max(1, Math.min(8, current.zoom * Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002))),
          x: crop.x + crop.width / 2,
          y: crop.y + crop.height / 2,
        };
      });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [image]);
  const crop = cropFor(image, view);
  /** Capture the pointer so dragging remains active outside the preview */
  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      crop,
      scaleX: image.width / bounds.width,
      scaleY: image.height / bounds.height,
    };
    setDragging(true);
  }
  /** Convert screen movement to source pixels and clamp both crop edges */
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const x = Math.max(
      0,
      Math.min(image.width - start.crop.width, start.crop.x + (event.clientX - start.x) * start.scaleX),
    );
    const y = Math.max(
      0,
      Math.min(image.height - start.crop.height, start.crop.y + (event.clientY - start.y) * start.scaleY),
    );
    setView((current) => ({ ...current, x: x + start.crop.width / 2, y: y + start.crop.height / 2 }));
  }
  /** Release drag state on pointer up, cancellation or lost capture */
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  /** Offer keyboard equivalents without restoring the position sliders */
  function adjustWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (drag.current) return;
    const step = event.shiftKey ? 20 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move && !["+", "=", "-"].includes(event.key)) return;
    event.preventDefault();
    setView((current) => {
      const crop = cropFor(image, current);
      return {
        zoom: move ? current.zoom : Math.max(1, Math.min(8, current.zoom * (event.key === "-" ? 1 / 1.1 : 1.1))),
        x: crop.x + crop.width / 2 + (move?.[0] ?? 0),
        y: crop.y + crop.height / 2 + (move?.[1] ?? 0),
      };
    });
  }
  return (
    <Dialog
      title="裁剪作品图片"
      onClose={close}
      actions={
        <>
          <Button onClick={() => onDone(null)}>取消裁剪</Button>
          <Button variant="primary" onClick={() => onDone(crop)}>
            确认裁剪并上传
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        <button
          type="button"
          ref={preview}
          className={styles.preview}
          aria-label="图片裁剪区域：滚轮缩放，拖动移动；方向键移动，加减键缩放"
          data-dragging={dragging}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={adjustWithKeyboard}
          style={{
            aspectRatio: `${image.width} / ${image.height}`,
            width: Math.min(360, (320 * image.width) / image.height),
          }}
        >
          <img src={url || undefined} alt="待裁剪图片" draggable={false} />
          <span
            className={styles.selection}
            data-crop-selection=""
            style={{
              left: `${(crop.x / image.width) * 100}%`,
              top: `${(crop.y / image.height) * 100}%`,
              width: `${(crop.width / image.width) * 100}%`,
              height: `${(crop.height / image.height) * 100}%`,
            }}
          />
        </button>
        <span>
          输出尺寸：{image.targetWidth} × {image.targetHeight} · PNG
        </span>
        <span className={styles.hint}>滚轮缩放裁剪框 · 按住拖动调整位置</span>
      </div>
    </Dialog>
  );
}
