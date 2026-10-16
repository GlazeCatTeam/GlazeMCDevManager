import {
  Button,
  callHost,
  Dialog,
  type McpConnectResult,
  type McpInstaller,
  type McpInstallerId,
  type McpLevel,
  mcpLevels,
  Notice,
  Tag,
  TextButton,
} from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import { examples } from "../examples";
import { unwrap } from "../useMcp";
import styles from "./ConnectDialog.module.css";

/** Pick a tool and a permission level, then let the host write the tool's configuration */
export function ConnectDialog({ onClose }: { onClose: () => void }) {
  const [installers, setInstallers] = useState<McpInstaller[] | null>(null);
  const [tool, setTool] = useState<McpInstallerId | null>(null);
  const [level, setLevel] = useState<McpLevel>("assist");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<McpConnectResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void callHost("mcp.installers")
      .then((value) => {
        if (!active) return;
        const list = unwrap(value);
        setInstallers(list);
        setTool((current) => current ?? list.find((entry) => entry.detected && entry.id !== "other")?.id ?? null);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "读取 AI 工具失败"));
    return () => {
      active = false;
    };
  }, []);

  const selected = installers?.find((entry) => entry.id === tool);
  /** Create the client and write the configuration in one step */
  const connect = async () => {
    if (!tool) return;
    setBusy(true);
    setError("");
    try {
      setResult(unwrap(await callHost("mcp.connect", { tool, level })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "连接失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  /** Copy text and report clipboard failures inline */
  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => setError("复制失败，请手动选中文字复制"));
  };

  if (result)
    return (
      <Dialog
        className={styles.dialog}
        title={result.installed ? `已连接 ${selected?.name ?? "AI 工具"}` : "还差一步"}
        onClose={onClose}
        actions={
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        }
      >
        <div className={styles.body}>
          {result.installed ? (
            <>
              <p className={styles.success}>{result.message}</p>
              <p className={styles.muted}>重启后可以试着对它说：</p>
              <ul className={styles.examples}>
                {examples.slice(0, 3).map((text) => (
                  <li key={text}>「{text}」</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              {tool !== "other" && <Notice>{result.message}</Notice>}
              <p>
                把下面这段话<b>原样发给你的 AI 工具</b>，它会自己完成连接。连上后回到这里就能看到它。
              </p>
              <textarea className={styles.prompt} readOnly rows={5} value={result.prompt} />
              <div className={styles.row}>
                <Button variant="primary" onClick={() => copy(result.prompt)}>
                  {copied ? "已复制" : "复制这段话"}
                </Button>
                <TextButton onClick={() => copy(result.endpoint)}>只复制连接地址</TextButton>
              </div>
              <p className={styles.muted}>连接地址里带有专属密钥，请不要发给别人。</p>
            </>
          )}
        </div>
      </Dialog>
    );

  return (
    <Dialog
      className={styles.dialog}
      title="连接 AI 工具"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!tool || busy} onClick={() => void connect()}>
            {busy ? "正在连接…" : tool === "other" ? "生成连接说明" : "一键连接"}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        {error && <Notice>{error}</Notice>}
        <section>
          <h3>1. 你在用哪个 AI 工具？</h3>
          {!installers && !error && <p className={styles.muted}>正在检测本机安装的 AI 工具…</p>}
          <div className={styles.tools}>
            {installers?.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={tool === entry.id}
                className={tool === entry.id ? `${styles.tool} ${styles.selected}` : styles.tool}
                onClick={() => setTool(entry.id)}
              >
                <span className={styles.toolName}>
                  {entry.name}
                  {entry.detected && entry.id !== "other" && <Tag>已安装</Tag>}
                </span>
                <span className={styles.muted}>{entry.target}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>2. 允许它做什么？</h3>
          <div className={styles.levels}>
            {(["view", "assist", "full"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={level === value}
                className={level === value ? `${styles.level} ${styles.selected}` : styles.level}
                onClick={() => setLevel(value)}
              >
                <b>
                  {mcpLevels[value].title}
                  {value === "assist" && <Tag>推荐</Tag>}
                </b>
                <span className={styles.muted}>{mcpLevels[value].description}</span>
              </button>
            ))}
          </div>
          <p className={styles.muted}>以后随时可以改；AI 需要更多权限时也会弹窗问你。</p>
        </section>
      </div>
    </Dialog>
  );
}
