import {
  Button,
  callHost,
  isMcpPort,
  MCP_DEFAULT_PORT,
  type McpSnapshot,
  Notice,
  Switch,
  TextButton,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { unwrap, type useAction } from "../useMcp";
import styles from "./AdvancedPanel.module.css";

const statusText: Record<McpSnapshot["status"], string> = {
  off: "已关闭",
  starting: "启动中",
  running: "运行中",
  error: "出错了",
};

/** Service switch, port and raw address, folded away from everyday use */
export function AdvancedPanel({ snapshot, action }: { snapshot: McpSnapshot; action: ReturnType<typeof useAction> }) {
  const [portInput, setPortInput] = useState<string | null>(null);
  const portText = portInput ?? String(snapshot.port ?? MCP_DEFAULT_PORT);
  const port = Number(portText);
  const validPort = /^\d+$/.test(portText) && isMcpPort(port);
  /** Enable, disable or rebind the listener */
  const apply = (enabled: boolean) =>
    action.run(async () => {
      if (enabled && !validPort) throw new Error("端口必须是 1 到 65535 之间的整数");
      const state = unwrap(await callHost("mcp.setEnabled", { enabled, ...(enabled ? { port } : {}) }));
      if (state.error) throw new Error(state.error);
      if (enabled) setPortInput(null);
    });

  return (
    <details className={styles.advanced}>
      <summary>
        高级设置 <span className={styles.muted}>· 连接服务{statusText[snapshot.status]}</span>
      </summary>
      <div className={styles.body}>
        <div className={styles.row}>
          <div>
            <b>AI 连接服务</b>
            <p className={styles.muted}>关闭后所有 AI 工具都会断开。一键连接时会自动打开。</p>
          </div>
          <Switch
            label="AI 连接服务"
            checked={snapshot.enabled}
            disabled={action.busy}
            onChange={(enabled) => void apply(enabled)}
          />
        </div>
        <div className={styles.row}>
          <div>
            <b>本机端口</b>
            <p className={styles.muted}>
              端口被其他程序占用时才需要修改。修改后 Glaze 会自动更新已一键连接的工具配置。
            </p>
          </div>
          <div className={styles.port}>
            <input
              className={styles.input}
              aria-label="本机端口"
              inputMode="numeric"
              value={portText}
              aria-invalid={!validPort}
              disabled={action.busy}
              onChange={(event) => setPortInput(event.target.value)}
            />
            <Button
              size="xs"
              disabled={action.busy || !validPort || (snapshot.status === "running" && port === snapshot.port)}
              onClick={() => void apply(true)}
            >
              应用
            </Button>
          </div>
        </div>
        {!validPort && <Notice>端口必须是 1 到 65535 之间的整数</Notice>}
        {snapshot.endpoint && (
          <div className={styles.row}>
            <div>
              <b>手动连接地址</b>
              <p className={styles.muted}>
                不带密钥，连接时需要在弹窗中允许，且每次重启都要重新允许。推荐用「连接 AI 工具」。
              </p>
            </div>
            <TextButton
              onClick={() =>
                void action.run(async () => {
                  await navigator.clipboard.writeText(snapshot.endpoint ?? "");
                  action.setMessage("已复制连接地址");
                })
              }
            >
              复制 {snapshot.endpoint}
            </TextButton>
          </div>
        )}
        <p className={styles.muted}>
          服务只监听本机（127.0.0.1），其他电脑无法连接。每个一键连接的工具都有独立密钥，移除后立即失效。
        </p>
      </div>
    </details>
  );
}
