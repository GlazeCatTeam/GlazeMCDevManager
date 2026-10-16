import {
  Button,
  callHost,
  Dialog,
  type HostQuery,
  Notice,
  type RpcResult,
  remoteImageUrl,
  Tag,
  TextButton,
  type WorkUpload,
} from "@glaze/plugin-sdk";
import { type ReactNode, useRef, useState } from "react";
import styles from "./PromotionPage.module.css";

/** Always render campaign dates in Beijing time, independent of the device timezone */
export function dateText(seconds: number): string {
  return seconds > 0
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(seconds * 1000))
    : "未提供";
}

/** Distinguish upcoming, accepting, reviewing and ended campaigns */
export function activityStatus(activity: { beginAt: number; applyEndAt: number; endAt: number }): string {
  const now = Date.now() / 1000;
  return now < activity.beginAt
    ? "未开始"
    : now <= activity.applyEndAt
      ? "报名中"
      : now <= activity.endAt
        ? "审核中"
        : "已结束";
}

/** Display known platform statuses while keeping unfamiliar values visible */
export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    init: "待审核",
    reviewing: "审核中",
    applying: "申请中",
    accept: "已通过",
    accepted: "已通过",
    approved: "已通过",
    reject: "未通过",
    rejected: "未通过",
    fail: "未通过",
    online: "展示中",
    offline: "已下线",
    success: "已通过",
    pending: "待审核",
    reviewing_1: "待官方一审",
    reviewing_2: "待官方二审",
    payable: "待支付",
    auction_success: "竞拍成功",
    auction_fail: "竞拍失败",
    ready: "待上线",
    pay_overtime: "支付超时",
    auto_offline: "自动下线",
    force_offline: "强制下线",
    cancel: "资源位已取消",
    to_modify: "待更正修改",
    unselected: "替补队列",
    showing: "展示中",
    showing_complete: "展示完成",
    expired: "已过期",
  };
  return (
    <Tag tone={["reject", "rejected", "fail"].includes(value) ? "warning" : "default"}>
      {labels[value] ?? (value || "未提供状态")}
    </Tag>
  );
}

/** Keep loading and stale-data failures distinct from a successful empty result */
export function QueryMessage({ query }: { query: Pick<HostQuery<unknown>, "data" | "loading" | "error" | "reload"> }) {
  return (
    <>
      {query.error && (
        <Notice
          action={
            <TextButton onClick={query.reload} disabled={query.loading}>
              重试
            </TextButton>
          }
        >
          {query.error.message}
          {query.data ? "；当前显示上次加载的数据" : ""}
        </Notice>
      )}
      {query.loading && !query.data && (
        <p className={styles.state} role="status">
          正在读取平台数据…
        </p>
      )}
    </>
  );
}

/** Require a reviewable confirmation and never automatically retry uncertain writes */
export function ConfirmAction({
  label,
  title,
  children,
  disabled,
  action,
  onSuccess,
  danger = false,
}: {
  label: string;
  title: string;
  children: ReactNode;
  disabled?: boolean;
  action: () => Promise<RpcResult<unknown>>;
  onSuccess: () => void;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  /** Dispatch the reviewed operation once and keep failures in the dialog */
  async function submit() {
    if (pending.current || disabled || uncertain) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      if (result.ok) {
        setOpen(false);
        onSuccess();
      } else {
        const unknown = ["network", "timeout", "parse", "internal"].includes(result.error.kind);
        setUncertain(unknown);
        setMessage(
          unknown
            ? `${result.error.message}。提交结果未确认，请关闭后刷新记录核对，避免重复提交。`
            : result.error.message,
        );
      }
    } catch {
      setUncertain(true);
      setMessage("提交结果未确认，请关闭后刷新记录核对，避免重复提交。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant={danger ? "secondary" : "primary"}
        disabled={disabled || busy || uncertain}
        onClick={() => {
          setMessage("");
          setOpen(true);
        }}
      >
        {label}
      </Button>
      {open && (
        <Dialog
          title={title}
          onClose={() => {
            if (!pending.current) setOpen(false);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setOpen(false)}>
                返回
              </Button>
              <Button variant="primary" disabled={busy || disabled || uncertain} onClick={() => void submit()}>
                {busy ? "正在提交…" : "确认提交"}
              </Button>
            </>
          }
        >
          <div className={styles.confirm}>
            {children}
            <p className={styles.muted}>确认后将提交到网易开发者平台。</p>
            {message && <Notice>{message}</Notice>}
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Match the official three image slots and single video slot with signed uploads */
export function Uploads({
  account,
  files,
  onChange,
  onBusy,
  kind = "image",
  disabled = false,
  className,
}: {
  account: string;
  files: (WorkUpload | null)[];
  onChange: (files: (WorkUpload | null)[]) => void;
  onBusy: (value: boolean) => void;
  kind?: "image" | "video";
  disabled?: boolean;
  className?: string | undefined;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  /** Native picker and upload stay in the host; cancelled selections leave the draft intact */
  async function upload(index: number) {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(index);
    onBusy(true);
    setError("");
    try {
      const result = await callHost("promotion.upload", {
        account,
        kind,
      });
      if (!result.ok) setError(result.error.message);
      else if (result.value) {
        const next = Array.from({ length: kind === "image" ? 3 : 1 }, (_, slot) => files[slot] ?? null);
        next[index] = result.value;
        onChange(next);
      }
    } catch {
      setError("上传失败，请重试");
    } finally {
      setBusy(null);
      onBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <span className={styles.label}>{kind === "image" ? "用于宣传的图片" : "用于宣传的视频"}</span>
      <div className={styles.materialGrid} data-video={kind === "video"}>
        {(kind === "image" ? [0, 1, 2] : [0]).map((index) => (
          <div key={`${kind}-${index}`} className={styles.materialSlot}>
            <button
              type="button"
              className={styles.uploadTile}
              disabled={disabled || busy !== null}
              aria-label={`${files[index] ? "替换" : "上传"}宣传${kind === "image" ? "图片" : "视频"}${kind === "image" ? ` ${index + 1}` : ""}`}
              onClick={() => void upload(index)}
            >
              {busy === index ? (
                <span className={styles.muted}>上传中…</span>
              ) : files[index] ? (
                kind === "image" ? (
                  <img src={remoteImageUrl(files[index].url) ?? undefined} alt={`宣传图片 ${index + 1}`} />
                ) : (
                  <span>
                    已上传
                    <br />
                    MP4
                  </span>
                )
              ) : (
                <span className={styles.uploadPlus} aria-hidden="true">
                  ＋
                </span>
              )}
            </button>
            {files[index] && (
              <>
                <span className={styles.materialName}>{files[index].name}</span>
                <TextButton
                  disabled={disabled || busy !== null}
                  aria-label={`移除宣传${kind === "image" ? `图片 ${index + 1}` : "视频"}`}
                  onClick={() => onChange(files.map((file, item) => (item === index ? null : file)))}
                >
                  移除
                </TextButton>
              </>
            )}
            <small className={styles.muted}>
              {kind === "image" ? (
                <>
                  限制格式：png、jpg、jpeg
                  <br />
                  限制大小：10 MB
                </>
              ) : (
                <>
                  视频文件
                  <br />
                  视频编码格式：H.264 的 MP4
                  <br />
                  音频编码格式：AAC
                  <br />
                  视频比例限制：16:9
                  <br />
                  限制大小：50 MB
                  <br />
                  限制时长：1 分 30 秒
                </>
              )}
            </small>
          </div>
        ))}
      </div>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
