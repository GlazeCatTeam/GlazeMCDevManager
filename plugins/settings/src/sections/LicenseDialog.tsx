import { Button, callHost, Dialog, TextButton, useHostQuery } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./AboutSection.module.css";
import sections from "./Sections.module.css";

/** Display bundled license text without depending on GitHub or an internet connection */
export function LicenseDialog({ onClose }: { onClose: () => void }) {
  const about = useHostQuery("app.getAbout");
  const licenses = useHostQuery("app.getLicenses");
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState("");

  /** Open the runtime notices through the host and retain the dialog on native failures */
  const openRuntime = async () => {
    if (opening) return;
    setOpening(true);
    setNotice("");
    try {
      const result = await callHost("app.openRuntimeNotices");
      if (!result.ok) throw new Error(result.error.message);
      setNotice("已打开运行时第三方许可声明。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "打开运行时许可声明失败，请重试。");
    } finally {
      setOpening(false);
    }
  };

  return (
    <Dialog
      title="开源许可与第三方声明"
      className={styles.licenseDialog}
      onClose={onClose}
      actions={<Button onClick={onClose}>关闭</Button>}
    >
      {about.loading && <p role="status">正在读取项目许可…</p>}
      {about.error && (
        <div role="alert" className={sections.toolbar}>
          <span>读取项目许可失败：{about.error.message}</span>
          <Button size="xs" disabled={about.loading} onClick={about.reload}>
            重试项目许可
          </Button>
        </div>
      )}
      {about.data && (
        <section aria-label="项目许可证" className={styles.projectLicense}>
          <h3>{about.data.projectLicense.name}</h3>
          <p>{about.data.projectLicense.summary}</p>
          <ul>
            <li>允许商用、修改和再分发，包括闭源衍生版本。</li>
            <li>再分发需保留适用的许可与归属声明，并注明文件修改。</li>
            <li>包含明确的专利授权；不授予商标权，条款规定的例外除外。</li>
          </ul>
          <p className={sections.muted}>以上为阅读提示，具体权利、义务和免责声明以英文原文为准。</p>
          <details className={styles.license}>
            <summary>Apache-2.0 完整原文</summary>
            <pre>{about.data.projectLicense.text}</pre>
          </details>
          <details className={styles.license}>
            <summary>NOTICE · 版权与归属声明</summary>
            <pre>{about.data.projectLicense.notice}</pre>
          </details>
        </section>
      )}
      <h3>第三方依赖与资源</h3>
      <p className={sections.muted}>各项保留原有声明。Minecraft 图标不属于本项目的 Apache-2.0 授权范围。</p>
      <p className={sections.muted}>MCDevManager 仅作为行为与接口参考，本项目不包含其源码，也不沿用其许可证。</p>
      {licenses.loading && <p role="status">正在读取依赖许可…</p>}
      {licenses.error && (
        <div role="alert" className={sections.toolbar}>
          <span>读取许可失败：{licenses.error.message}</span>
          <Button size="xs" disabled={licenses.loading} onClick={licenses.reload}>
            重试
          </Button>
        </div>
      )}
      {licenses.data && (
        <>
          <p className={sections.muted}>共 {licenses.data.length} 项依赖、运行时与内置资源；展开查看完整声明。</p>
          {licenses.data.map((item) => (
            <details key={`${item.name}@${item.version}`} className={styles.license}>
              <summary>
                {item.name} · {item.version}
                <span>{item.license}</span>
              </summary>
              {item.notices.map((entry) => (
                <section key={entry.file}>
                  <h4>{entry.file}</h4>
                  <pre>{entry.text}</pre>
                </section>
              ))}
            </details>
          ))}
        </>
      )}
      <div className={styles.runtimeNotices}>
        <p>Chromium 及运行时所含的其他第三方组件声明随应用分发，可离线查看。</p>
        <TextButton disabled={opening} onClick={() => void openRuntime()}>
          {opening ? "正在打开…" : "查看运行时第三方声明"}
        </TextButton>
        {notice && <p role="status">{notice}</p>}
      </div>
    </Dialog>
  );
}
