import { Button, remoteImageUrl, remoteVideoUrl } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./WorkEditor.module.css";

/** Read-only playback remains available while the editing controls are locked */
export function VideoPreview({ source, cover }: { source: string; cover: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.videoPreview}>
      {/* Platform uploads have no separate caption track */}
      {/* biome-ignore lint/a11y/useMediaCaption: Preview the user's uploaded video as supplied */}
      <video
        key={attempt}
        className={styles.videoPlayer}
        src={`${remoteVideoUrl(source)}&attempt=${attempt}`}
        poster={remoteImageUrl(cover) ?? undefined}
        controls
        playsInline
        preload="metadata"
        aria-label="作品视频预览"
        onError={() => setFailed(true)}
        onLoadedData={() => setFailed(false)}
      />
      {failed && (
        <div className={styles.actions}>
          <span className={styles.danger} role="alert">
            视频加载失败，请检查网络后重试；也可能是视频地址已失效或格式不支持。
          </span>
          <Button
            size="sm"
            onClick={() => {
              setFailed(false);
              // Chromium can retain a failed media request even after load()
              setAttempt((previous) => previous + 1);
            }}
          >
            重新加载视频
          </Button>
        </div>
      )}
    </div>
  );
}
