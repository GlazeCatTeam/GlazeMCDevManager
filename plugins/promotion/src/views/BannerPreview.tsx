import { remoteImageUrl, TextButton } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./BannerWorkspace.module.css";

/** Preserve the image area and offer a preview-only retry without reuploading the file */
export function BannerPreview({ url, alt }: { url: string; alt: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  return (
    <div className={styles.imagePreview}>
      {failedUrl === url ? (
        <div className={styles.imagePlaceholder}>
          <span>图片暂时无法预览，已上传的内容仍保留</span>
          <TextButton
            onClick={() => {
              setFailedUrl(null);
              setAttempt((value) => value + 1);
            }}
          >
            重新加载预览
          </TextButton>
        </div>
      ) : (
        <img
          key={`${url}:${attempt}`}
          src={remoteImageUrl(url) ?? undefined}
          alt={alt}
          onError={() => setFailedUrl(url)}
        />
      )}
    </div>
  );
}
