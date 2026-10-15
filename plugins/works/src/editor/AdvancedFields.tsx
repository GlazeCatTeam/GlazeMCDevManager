import {
  Button,
  Notice,
  remoteImageUrl,
  TextButton,
  type WorkEditorOptions,
  type WorkRecord,
  type WorkValue,
  workScheduleTime,
} from "@glaze/plugin-sdk";
import { type EditorSectionProps, Field, Input, number, rows, text, YesNo } from "./fields";
import type { UploadFile } from "./MediaSections";
import styles from "./WorkEditor.module.css";

/** Show and replace the authorization image without exposing a local file path */
export function AuthorizationField({ value, disabled, change, upload }: EditorSectionProps & { upload: UploadFile }) {
  return (
    <div className={styles.stack}>
      <span className={styles.label}>非原创授权证明 *</span>
      {text(value.corp_proof_image) && (
        <img className={styles.proof} src={remoteImageUrl(text(value.corp_proof_image)) ?? ""} alt="授权证明" />
      )}
      <div className={styles.actions}>
        <Button
          disabled={disabled}
          onClick={async () => {
            const image = await upload("proof");
            if (image) change("corp_proof_image", image.url);
          }}
        >
          选择 / 替换授权证明
        </Button>
        <TextButton
          disabled={disabled || !value.corp_proof_image}
          tone="danger"
          onClick={() => change("corp_proof_image", "")}
        >
          移除授权证明
        </TextButton>
      </div>
      <span className={styles.hint}>PNG/JPG，最大 10M。非原创作品保存时必须提供有效授权图片。</span>
    </div>
  );
}

/** Convert platform seconds to the Beijing date used in the discount editor */
function discountDate(value: WorkValue | undefined): string {
  return typeof value === "number" && value > 0 ? new Date(value * 1000 + 8 * 3600_000).toISOString().slice(0, 10) : "";
}

/** Edit explicit discount rows, including removal of the last discount */
export function DiscountFields({ value, disabled, change }: EditorSectionProps) {
  const list = rows(value.discount);
  const allowed = value.price_type === "diamond" && number(value.price_rank) >= 1;
  const update = (index: number, patch: WorkRecord) =>
    change(
      "discount",
      list.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  return (
    <div className={styles.stack}>
      <span className={styles.label}>作品折扣</span>
      <span className={styles.hint}>
        钻石二档及以上可设置，日期按北京时间计算，结束日包含当天。活动折扣请在活动平台管理。
      </span>
      {list.map((d, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Rows are fully controlled protocol positions, without row-local state
        <div className={styles.discount} key={`${i}`}>
          <label className={styles.field}>
            折扣比例（支付原价的 %）
            <input
              aria-label={`折扣 ${i + 1} 比例`}
              className={styles.input}
              type="number"
              min={1}
              max={99}
              value={number(d.discount)}
              disabled={disabled || !allowed || d.is_activity_discount === 1}
              onChange={(e) => update(i, { discount: Number(e.target.value), vip_discount: Number(e.target.value) })}
            />
          </label>
          {(["begin_at", "end_at"] as const).map((key) => (
            <label className={styles.field} key={key}>
              {key === "begin_at" ? "开始日期" : "结束日期"}
              <input
                aria-label={`折扣 ${i + 1} ${key === "begin_at" ? "开始" : "结束"}`}
                className={styles.input}
                type="date"
                value={discountDate(d[key])}
                disabled={disabled || !allowed || d.is_activity_discount === 1}
                onChange={(e) =>
                  update(i, {
                    [key]:
                      (workScheduleTime(`${e.target.value} ${key === "begin_at" ? "00:00:00" : "23:59:59"}`) ?? 0) /
                      1000,
                  })
                }
              />
            </label>
          ))}
          <TextButton
            tone="danger"
            disabled={disabled || d.is_activity_discount === 1}
            onClick={() =>
              change(
                "discount",
                list.filter((_, index) => index !== i),
              )
            }
          >
            移除折扣 {i + 1}
          </TextButton>
        </div>
      ))}
      {!allowed && list.length > 0 && <Notice>新价格不支持折扣，请移除原有普通折扣后保存。</Notice>}
      <Button
        disabled={disabled || !allowed}
        onClick={() => {
          const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
          const begin = (workScheduleTime(`${today} 00:00:00`) ?? 0) / 1000;
          change("discount", [
            ...list,
            { begin_at: begin, end_at: begin + 7 * 86400 - 1, discount: 90, vip_discount: 90, is_activity_discount: 0 },
          ]);
        }}
      >
        添加折扣
      </Button>
    </div>
  );
}

/** Configure lobby capacity and competitive mode using current platform tags */
export function LobbyFields({
  value,
  disabled,
  change,
  choices,
}: EditorSectionProps & { choices: WorkEditorOptions | null }) {
  const selected = Array.isArray(value.lobby_tags) ? value.lobby_tags : [];
  const integer = (key: string, label: string, min: number, max: number) => (
    <label className={styles.field} key={key}>
      {label}
      <input
        className={styles.input}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={number(value[key])}
        disabled={disabled}
        onChange={(e) => change(key, Number(e.target.value))}
      />
    </label>
  );
  return (
    <div className={styles.stack}>
      <span className={styles.label}>联机大厅设置</span>
      <div className={styles.fields}>
        {integer("lobby_min_num", "建议最少人数", 0, 10)}
        {integer("lobby_max_num", "建议最多人数", 0, 10)}
        {integer("lobby_force_max_num", "房间限制人数", 2, 10)}
      </div>
      <span className={styles.hint}>建议人数同时填 0 表示关闭；开启时不少于 2，且不超过房间限制人数。</span>
      <Field label="联机大厅专区分类 *">
        <div className={styles.checks}>
          {choices?.lobbyTags?.map((tag) => (
            <label key={tag.id}>
              <input
                type="checkbox"
                checked={selected.includes(tag.id)}
                disabled={disabled}
                onChange={(e) => {
                  const competitiveId = choices.lobbyCompetitiveTagId;
                  const next = !e.target.checked
                    ? selected.filter((id) => id !== tag.id)
                    : tag.id === competitiveId
                      ? [tag.id]
                      : [...selected.filter((id) => id !== competitiveId), tag.id];
                  change("lobby_tags", next);
                  change("is_lobby_competitive", next.includes(competitiveId ?? -1));
                }}
              />
              {tag.title}
            </label>
          ))}
        </div>
      </Field>
      {!choices?.lobbyTags?.length && <Notice>平台未返回联机大厅分类，请刷新选项后再保存。</Notice>}
      {value.is_lobby_competitive === true && (
        <>
          <YesNo
            label="非对称对抗"
            value={value.is_asymmetric === true}
            disabled={disabled}
            onChange={(v) => {
              change("is_asymmetric", v);
              if (v && (!Array.isArray(value.lobby_camps) || value.lobby_camps.length < 2))
                change("lobby_camps", ["", ""]);
            }}
          />
          {value.is_asymmetric === true && (
            <div className={styles.stack}>
              {(Array.isArray(value.lobby_camps) ? value.lobby_camps : []).map((camp, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Camp inputs are fully controlled by their protocol position
                <div className={styles.file} key={`${i}`}>
                  <Input
                    label={`阵营 ${i + 1}`}
                    value={text(camp)}
                    maxLength={50}
                    disabled={disabled}
                    onChange={(v) =>
                      change(
                        "lobby_camps",
                        (value.lobby_camps as WorkValue[]).map((old, index) => (index === i ? v : old)),
                      )
                    }
                  />
                  <TextButton
                    disabled={disabled}
                    tone="danger"
                    onClick={() =>
                      change(
                        "lobby_camps",
                        (value.lobby_camps as WorkValue[]).filter((_, index) => index !== i),
                      )
                    }
                  >
                    移除阵营
                  </TextButton>
                </div>
              ))}
              <Button
                disabled={disabled || (Array.isArray(value.lobby_camps) && value.lobby_camps.length >= 15)}
                onClick={() =>
                  change("lobby_camps", [...(Array.isArray(value.lobby_camps) ? value.lobby_camps : []), ""])
                }
              >
                添加阵营
              </Button>
            </div>
          )}
          <div className={styles.fields}>
            {integer("lobby_player_num", "游戏开始人数", 1, 15)}
            {integer("lobby_reconnect_time", "逃跑时间（分钟）", 1, 99)}
          </div>
          <YesNo
            label="在普通模式中显示"
            value={value.lobby_normal_mode === true}
            disabled={disabled}
            onChange={(v) => change("lobby_normal_mode", v)}
          />
        </>
      )}
    </div>
  );
}
