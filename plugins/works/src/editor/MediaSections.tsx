import {
  Button,
  remoteImageUrl,
  TextButton,
  type WorkEditorOptions,
  type WorkImageSlot,
  type WorkRecord,
  type WorkUpload,
  type WorkUploadKind,
} from "@glaze/plugin-sdk";
import { EditorSection, type EditorSectionActions } from "./EditorSection";
import { type EditorSectionProps, object, rows, text } from "./fields";
import styles from "./WorkEditor.module.css";

export type UploadFile = (
  kind: WorkUploadKind,
  channelId?: number,
  platform?: "pe" | "pc",
  droppedFile?: File,
) => Promise<WorkUpload | null>;

/** Keep unknown and disabled image slots while changing only the chosen channel */
export function ImageSlots({
  slots,
  channels,
  disabled,
  upload,
  onChange,
  platform = "pe",
}: {
  slots: WorkImageSlot[];
  channels: WorkRecord[];
  disabled: boolean;
  upload: UploadFile;
  onChange: (channels: WorkRecord[]) => void;
  platform?: "pe" | "pc";
}) {
  /** Attach a signed upload receipt; previews use the separately returned URL */
  const replace = async (slot: WorkImageSlot) => {
    const uploaded = await upload("image", slot.id, platform);
    if (!uploaded) return;
    const previous = channels.find((image) => image.channel_id === slot.id);
    onChange([
      ...channels.filter((image) => image.channel_id !== slot.id),
      { ...previous, channel_id: slot.id, channel_url: uploaded.receipt, version: slot.version },
    ]);
  };
  return (
    <div className={styles.gallery}>
      {slots.map((slot) => {
        const channel = channels.find((image) => image.channel_id === slot.id);
        const source = mediaUrl(channel?.channel_url);
        const inactive = /暂未启用/.test(slot.title);
        return (
          <div className={styles.imageSlot} key={slot.id}>
            <button
              type="button"
              className={styles.imageButton}
              disabled={disabled || inactive}
              aria-label={`替换${slot.title}`}
              onClick={() => void replace(slot)}
            >
              {source ? (
                <img src={remoteImageUrl(source) ?? ""} alt={slot.title} draggable={false} />
              ) : (
                <span>＋ 选择图片</span>
              )}
            </button>
            <strong>{slot.title}</strong>
            <span className={styles.hint}>
              {slot.width} × {slot.height} · PNG/JPG ≤10M
            </span>
            <div className={styles.actions}>
              <TextButton disabled={disabled || inactive} onClick={() => void replace(slot)}>
                替换
              </TextButton>
              <TextButton
                tone="danger"
                disabled={disabled || inactive || !channel}
                onClick={() => onChange(channels.filter((image) => image.channel_id !== slot.id))}
              >
                移除
              </TextButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Read existing URLs and newly uploaded receipts without trusting their HTML */
export function mediaUrl(value: WorkRecord[string] | undefined): string {
  if (typeof value === "string") return value;
  const body = object(value).body;
  if (typeof body !== "string") return "";
  try {
    const parsed: unknown = JSON.parse(body);
    const data = object(parsed as WorkRecord);
    return text(data.url ?? data.filename);
  } catch {
    return "";
  }
}

/** Image, promotion and video editors correspond to independent platform update sections */
export function MediaSections({
  value,
  disabled,
  change,
  choices,
  upload,
  save,
  dirty,
  editing,
  beginEdit,
  creating = false,
}: EditorSectionProps &
  EditorSectionActions & { choices: WorkEditorOptions | null; upload: UploadFile; creating?: boolean }) {
  const actions = { disabled, save, dirty, editing, beginEdit, creating };
  const videos = rows(value.video_info_list);
  const video = videos[0];
  /** Replace one video while retaining any remaining server records */
  const replaceVideo = async () => {
    const file = await upload("video");
    if (file)
      change("video_info_list", [
        { ...video, url: file.receipt, size: file.size, cover: video?.cover ?? "" },
        ...videos.slice(1),
      ]);
  };
  /** Replace the cover separately from the video data */
  const replaceCover = async () => {
    const file = await upload("videoCover");
    if (file && video) change("video_info_list", [{ ...video, cover: file.receipt }, ...videos.slice(1)]);
  };
  return (
    <>
      <EditorSection section="images" title="PE 图片" {...actions}>
        {!choices ? (
          <p className={styles.hint}>正在加载平台图片位…</p>
        ) : (
          <ImageSlots
            slots={choices.peImages.filter((slot) => slot.id !== 7)}
            channels={rows(value.channel)}
            disabled={disabled || !editing("images")}
            upload={upload}
            onChange={(images) => change("channel", images)}
          />
        )}
      </EditorSection>
      <EditorSection section="banner" title="资源中心首页轮播推广广图" {...actions}>
        <div className={styles.promotion}>
          {text(value.banner_pic) && <img src={remoteImageUrl(text(value.banner_pic)) ?? ""} alt="首页轮播推广广图" />}
          <div className={styles.stack}>
            <span className={styles.hint}>940 × 450 · PNG/JPG/JPEG · 最大 10M · 可选</span>
            <div className={styles.actions}>
              <Button
                size="sm"
                disabled={disabled}
                onClick={async () => {
                  const file = await upload("banner");
                  if (file) change("banner_pic", file.url);
                }}
              >
                选择 / 替换
              </Button>
              <TextButton
                tone="danger"
                disabled={disabled || !value.banner_pic}
                onClick={() => change("banner_pic", "")}
              >
                移除
              </TextButton>
            </div>
            <span className={styles.hint}>上传不代表获得推广位；推广申请与竞拍仍按平台流程处理。</span>
          </div>
        </div>
      </EditorSection>
      <EditorSection section="video" title="视频与封面" {...actions}>
        <div className={styles.fields}>
          <div className={styles.stack}>
            <strong>作品视频</strong>
            <span className={styles.fileName}>
              {video ? mediaUrl(video.url).split("/").pop() || "已上传视频" : "暂无视频"}
            </span>
            <span className={styles.hint}>
              MP4 · H.264 / AAC · 16:9
              <br />
              最大 50M · 最长 1 分 30 秒
            </span>
            <div className={styles.actions}>
              <Button size="sm" disabled={disabled} onClick={() => void replaceVideo()}>
                上传 / 替换视频
              </Button>
              <TextButton
                tone="danger"
                disabled={disabled || !video}
                onClick={() => change("video_info_list", videos.slice(1))}
              >
                移除
              </TextButton>
            </div>
          </div>
          <div className={styles.imageSlot}>
            {video?.cover && (
              <img className={styles.videoCover} src={remoteImageUrl(mediaUrl(video.cover)) ?? ""} alt="视频封面" />
            )}
            <strong>视频封面</strong>
            <span className={styles.hint}>992 × 558 · PNG/JPG ≤10M</span>
            <div className={styles.actions}>
              <Button size="sm" disabled={disabled || !video} onClick={() => void replaceCover()}>
                选择封面
              </Button>
              <TextButton
                tone="danger"
                disabled={disabled || !video?.cover}
                onClick={() => change("video_info_list", [{ ...video, cover: "" }, ...videos.slice(1)])}
              >
                移除
              </TextButton>
            </div>
          </div>
        </div>
      </EditorSection>
    </>
  );
}
