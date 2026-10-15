import {
  Button,
  callHost,
  Dialog,
  Notice,
  type WorkEditorOptions,
  type WorkOperationMethod,
  type WorkOperationParams,
  type WorkSummary,
  workDiamondPrices,
  workScheduleTime,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTime } from "../format";
import { actionLabels, type WorkAction } from "../status";
import { invalidateWorks } from "../useWorkQuery";
import styles from "./WorkActionDialog.module.css";
import { WorkPrice } from "./WorkPrice";
import { beijingInput, WorkSchedulePicker } from "./WorkSchedulePicker";

export type ListWriteAction = Exclude<WorkAction, "update" | "submitReview" | "viewFeedback">;
const uncertainWorks = new Set<string>();
const descriptions: Record<ListWriteAction, string> = {
  cancelReview: "取消当前审核。操作成功后可重新编辑或提交审核。",
  publish: "立即上架作品；同时同步已配置的发布平台。",
  appointOnline: "按所选北京时间定时上架，同时同步已配置的发布平台。已有预约将被替换。",
  cancelAppointOnline: "取消当前预约上架时间。取消成功后可以重新设置定时上架。",
  submitSelfTest: "提交作品进入自测流程。默认需要机审，免机审资格以平台判断为准。",
  cancelTest: "结束当前自测流程。操作成功后可重新编辑作品。",
  delete: "删除这个待提交审核的作品。此操作不可撤销，请确认作品名称和 ID。",
  changePrice: "独立调整已上架作品的价格，保留原定价币种。",
};

/** Confirm one list action, retain failures and require explicit reconciliation after ambiguous writes */
export function WorkActionDialog({
  work,
  account,
  action,
  onClose,
  onRefresh,
  onCompleted,
}: {
  work: WorkSummary;
  account: string;
  action: ListWriteAction;
  onClose: () => void;
  onRefresh: () => void;
  onCompleted: (message: string) => void;
}) {
  const key = JSON.stringify([account, work.itemId]);
  const [uncertain, setUncertain] = useState(() => uncertainWorks.has(key));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<WorkEditorOptions | null>(null);
  const scheduleAction = action === "appointOnline" || action === "cancelAppointOnline";
  const [loading, setLoading] = useState(action === "changePrice" || scheduleAction);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const [time, setTime] = useState(() => beijingInput(Date.now() + 3600_000));
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (action !== "appointOnline") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [action]);
  const [price, setPrice] = useState(String(work.price));
  const [passCheck, setPassCheck] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    void revision;
    if (action !== "changePrice" && !scheduleAction) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const read = async () => {
      try {
        if (action === "changePrice") {
          const result = await callHost("works.options", { account });
          if (cancelled) return;
          if (result.ok) setOptions(result.value);
          else setLoadError(result.error.message);
        } else {
          const result = await callHost("works.get", { account, itemId: work.itemId });
          if (cancelled) return;
          if (result.ok) {
            const appointment = result.value.appointOnlineTime;
            setScheduled(appointment);
            if (appointment && (workScheduleTime(appointment) ?? 0) > Date.now()) {
              setTime(appointment.replace(" ", "T").slice(0, 16));
            }
          } else setLoadError(result.error.message);
        }
      } catch {
        if (!cancelled) setLoadError("加载失败，请重试");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void read();
    return () => {
      cancelled = true;
    };
  }, [account, work.itemId, action, revision, scheduleAction]);
  const close = useCallback(() => {
    if (!inFlight.current) onClose();
  }, [onClose]);
  const rule = options?.prices.find((p) => p.id === work.priceType);
  const newPrice = Number(price);
  const dateValue = `${time.replace("T", " ")}:00`;
  const validTime = (workScheduleTime(dateValue) ?? 0) > now;
  const validPrice =
    !!rule &&
    Number.isSafeInteger(newPrice) &&
    newPrice > 0 &&
    newPrice !== work.price &&
    newPrice >= rule.min &&
    (rule.max === null || newPrice <= rule.max) &&
    (rule.step <= 0 || (newPrice - rule.min) % rule.step === 0) &&
    (work.priceType !== "diamond" || (workDiamondPrices as readonly number[]).includes(newPrice));
  const invalid = (action === "changePrice" && !validPrice) || (action === "appointOnline" && !validTime);

  /** Send once on explicit confirmation; uncertain outcomes remain locked across page navigation */
  const confirm = async () => {
    if (inFlight.current || loading || loadError || invalid || uncertain) return;
    if (action === "appointOnline" && (workScheduleTime(dateValue) ?? 0) <= Date.now()) {
      setNow(Date.now());
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const params: WorkOperationParams = { account, itemId: work.itemId, expectedStatus: work.status };
    if (action === "submitSelfTest") params.passCheck = passCheck;
    if (action === "appointOnline") params.appointOnlineTime = dateValue;
    if (action === "changePrice")
      Object.assign(params, { price: newPrice, expectedPrice: work.price, expectedPriceType: work.priceType });
    try {
      const result = await callHost(`works.${action}` as WorkOperationMethod, params);
      if (result.ok && result.value.outcome === "uncertain") uncertainWorks.add(key);
      if (result.ok) invalidateWorks(account);
      if (!alive.current) return;
      if (!result.ok) {
        setError(result.error.message);
      } else if (result.value.outcome === "uncertain") {
        setUncertain(true);
        onRefresh();
      } else {
        onCompleted(
          action === "appointOnline"
            ? `「${work.name}」已设置定时上架：${dateValue}（北京时间）`
            : `「${work.name}」${actionLabels[action]}成功`,
        );
      }
    } catch {
      uncertainWorks.add(key);
      invalidateWorks(account);
      if (alive.current) {
        setUncertain(true);
        onRefresh();
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Dialog
      title={`${actionLabels[action]}确认`}
      className={action === "appointOnline" ? styles.scheduleDialog : undefined}
      onClose={close}
      actions={
        <>
          <Button disabled={busy} onClick={close}>
            {uncertain ? "返回列表核对" : "取消"}
          </Button>
          {!uncertain && (
            <Button
              variant={action === "delete" ? "danger" : "primary"}
              disabled={busy || loading || !!loadError || invalid}
              onClick={() => void confirm()}
            >
              {busy ? "正在处理…" : `确认${actionLabels[action]}`}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.content}>
        <strong className={styles.name}>{work.name}</strong>
        <span className={styles.muted}>作品 ID：{work.itemId}</span>
        <p>{descriptions[action]}</p>
        {uncertain ? (
          <>
            <Notice>上次操作结果未能确认，可能已经生效。请先刷新列表或在开发者平台核对，避免重复操作。</Notice>
            <Button
              onClick={() => {
                uncertainWorks.delete(key);
                setUncertain(false);
                setError(null);
                onRefresh();
                onClose();
              }}
            >
              已核对结果，返回列表
            </Button>
          </>
        ) : (
          <>
            {loading && (
              <span role="status" className={styles.muted}>
                正在读取平台配置…
              </span>
            )}
            {loadError && (
              <Notice
                action={
                  <Button size="xs" onClick={() => setRevision((v) => v + 1)}>
                    重试
                  </Button>
                }
              >
                {loadError}
              </Notice>
            )}
            {action === "submitSelfTest" && (
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={passCheck}
                  disabled={busy}
                  onChange={(e) => setPassCheck(e.target.checked)}
                />
                免机审
              </label>
            )}
            {scheduleAction && scheduled && scheduled !== "UNKNOWN" && (
              <span className={styles.muted}>
                当前预约：{action === "cancelAppointOnline" ? formatDateTime(scheduled) : scheduled}
              </span>
            )}
            {action === "appointOnline" && (
              <WorkSchedulePicker value={time} onChange={setTime} now={now} disabled={busy || loading || !!loadError} />
            )}
            {action === "changePrice" && (
              <>
                <span>
                  当前价格：
                  <WorkPrice price={work.price} priceType={work.priceType} />
                </span>
                <label className={styles.field} htmlFor="work-action-price">
                  新价格（{work.priceType === "diamond" ? "钻石" : "绿宝石"}）
                  {work.priceType === "diamond" ? (
                    <select
                      id="work-action-price"
                      className={styles.input}
                      value={price}
                      disabled={busy || loading || !rule}
                      onChange={(e) => setPrice(e.target.value)}
                    >
                      {workDiamondPrices.map((p) => (
                        <option key={p} value={p}>
                          {p} 钻石
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="work-action-price"
                      className={styles.input}
                      type="number"
                      value={price}
                      min={rule?.min ?? 1}
                      max={rule?.max ?? undefined}
                      step={rule?.step || 1}
                      disabled={busy || loading || !rule}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  )}
                </label>
                {rule && (
                  <span className={styles.muted}>
                    平台范围：{rule.min}–{rule.max ?? "不限"}
                    {rule.step > 0 ? `，步长 ${rule.step}` : ""}。新价格须与当前价格不同。
                  </span>
                )}
                {!loading && !loadError && !rule && <Notice>平台没有返回此币种的定价规则，暂不能调整。</Notice>}
                {validPrice && (
                  <span>
                    调整后：
                    <WorkPrice price={newPrice} priceType={work.priceType} />
                  </span>
                )}
              </>
            )}
            {error && <Notice>{error}</Notice>}
          </>
        )}
      </div>
    </Dialog>
  );
}
