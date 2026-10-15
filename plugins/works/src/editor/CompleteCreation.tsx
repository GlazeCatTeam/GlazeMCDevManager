import {
  Button,
  callHost,
  Dialog,
  Notice,
  Panel,
  TextButton,
  useHostQuery,
  type WorkRecord,
  type WorkSummary,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./WorkEditor.module.css";

/** Apply update-only fields to the exact work explicitly selected after creation */
export function CompleteCreation({
  account,
  name,
  patch,
  uncertain,
  onUncertain,
  onDone,
  onClose,
}: {
  account: string;
  name: string;
  patch: WorkRecord;
  uncertain: boolean;
  onUncertain: (value: boolean) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const list = useHostQuery("works.list", { account });
  const [id, setId] = useState("");
  const [confirm, setConfirm] = useState<WorkSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = list.data?.find((work) => work.itemId === id);
  /** Re-read a baseline before applying only the retained configuration */
  const apply = async () => {
    if (!confirm || busy || uncertain) return;
    setBusy(true);
    setError("");
    const target = confirm;
    setConfirm(null);
    try {
      const detail = await callHost("works.editor", { account, itemId: target.itemId });
      if (!detail.ok) {
        setError(detail.error.message);
        return;
      }
      const result = await callHost("works.save", {
        account,
        itemId: target.itemId,
        patch,
        base: Object.fromEntries(Object.keys(patch).map((key) => [key, detail.value.fields[key] ?? null])),
      });
      if (result.ok) onDone();
      else {
        setError(result.error.message);
        if (["network", "timeout", "internal"].includes(result.error.kind)) onUncertain(true);
      }
    } catch {
      setError("无法确认配置保存结果，请核对所选作品后再操作");
      onUncertain(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.page}>
      <TextButton disabled={busy} onClick={onClose}>
        ‹ 返回作品列表（保留配置）
      </TextButton>
      <Panel title="作品已创建：应用剩余配置">
        <div className={styles.stack}>
          <Notice>
            「{name}」已创建，尚未提审。平台未保证返回新作品 ID，请在下方明确选择刚创建的作品，再应用 PC
            同步、关联、授权或折扣配置。不会重复创建。
          </Notice>
          {list.error && <Notice>{list.error.message}</Notice>}
          <Button disabled={busy || list.loading} onClick={list.reload}>
            刷新作品列表
          </Button>
          <label className={styles.field}>
            选择刚创建的作品
            <select
              className={styles.input}
              aria-label="选择刚创建的作品"
              value={id}
              disabled={busy || list.loading}
              onChange={(e) => setId(e.target.value)}
            >
              <option value="">请选择并核对作品 ID</option>
              {list.data?.map((work) => (
                <option key={work.itemId} value={work.itemId}>
                  {work.name} · {work.itemId}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.hint}>
            仅应用：
            {Object.keys(patch)
              .map(
                (key) =>
                  ({
                    sync_pc_flag: "PC 同步",
                    sync_item_info: "PC 配置",
                    dlc_info: "关联模式",
                    relate_item_id: "关联作品",
                    corp_proof_image: "授权证明",
                    discount: "作品折扣",
                  })[key] ?? key,
              )
              .join("、")}
          </span>
          {error && <Notice>{error}</Notice>}
          {uncertain && (
            <Notice
              action={
                <Button
                  disabled={busy}
                  onClick={() => {
                    onUncertain(false);
                    list.reload();
                  }}
                >
                  已核对平台结果
                </Button>
              }
            >
              上次配置保存结果不明，请先在所选作品详情或官方平台核对。
            </Notice>
          )}
          <Button
            variant="primary"
            disabled={busy || !selected || uncertain}
            onClick={() => setConfirm(selected ?? null)}
          >
            {busy ? "正在应用…" : "应用配置"}
          </Button>
        </div>
      </Panel>
      {confirm && (
        <Dialog
          title="确认应用新建配置"
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>取消</Button>
              <Button variant="primary" onClick={() => void apply()}>
                确认应用
              </Button>
            </>
          }
        >
          <p>
            将把保留配置写入「{confirm.name}」（{confirm.itemId}）。请确认这就是刚创建的作品。
          </p>
        </Dialog>
      )}
    </div>
  );
}
