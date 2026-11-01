import {
  Button,
  callHost,
  Dialog,
  type McpAccessRequest,
  type McpDecision,
  mcpLevels,
  mcpPermissionLabels,
  Notice,
  onHostEvent,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./AccessRequestDialog.module.css";

/** App-wide prompt for AI connection and permission requests, shown on whichever page is open */
export function AccessRequestDialog() {
  const [requests, setRequests] = useState<McpAccessRequest[]>([]);
  // Closing only hides a prompt; it stays answerable on the AI assistant page
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const serial = useRef(0);
  const reload = useCallback(async () => {
    const turn = ++serial.current;
    try {
      const result = await callHost("mcp.snapshot");
      if (turn === serial.current && result.ok) setRequests(result.value.requests);
    } catch {
      // The next change event retries
    }
  }, []);
  useEffect(() => {
    void reload();
    const off = onHostEvent("mcp.changed", () => void reload());
    return () => {
      serial.current++;
      off();
    };
  }, [reload]);
  useEffect(() => {
    const next = Math.min(...requests.map((entry) => entry.expiresAt));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => void reload(), Math.max(0, next - Date.now() + 1));
    return () => window.clearTimeout(timer);
  }, [requests, reload]);

  const waiting = requests.filter((entry) => entry.expiresAt > Date.now() && !dismissed.includes(entry.id));
  const request = waiting[0];
  const requestId = request?.id;
  useEffect(() => {
    if (requestId) void callHost("mcp.promptEvent", { requestId, event: "shown" }).catch(() => undefined);
  }, [requestId]);
  if (!request) return null;
  /** Send the decision; the waiting tool call continues on the host */
  const answer = async (decision: McpDecision) => {
    setBusy(true);
    setError("");
    try {
      const result = await callHost("mcp.answer", { requestId: request.id, decision });
      if (!result.ok) setError(result.error.message);
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const connect = request.kind === "connect";

  return (
    <Dialog
      className={styles.dialog}
      title={connect ? `${request.clientName} 想连接 Glaze` : `${request.clientName} 需要你的允许`}
      onClose={() => {
        setDismissed([...dismissed, request.id]);
        void callHost("mcp.promptEvent", { requestId: request.id, event: "dismissed" }).catch(() => undefined);
      }}
      actions={
        connect ? (
          <>
            <Button disabled={busy} onClick={() => void answer("deny")}>
              拒绝
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void answer("always")}>
              允许连接
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={() => void answer("deny")}>
              拒绝
            </Button>
            <Button disabled={busy} onClick={() => void answer("once")}>
              仅这一次
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void answer("always")}>
              一直允许
            </Button>
          </>
        )
      }
    >
      <div className={styles.body}>
        {error && <Notice>{error}</Notice>}
        <p className={styles.reason}>「{request.reason}」</p>
        {connect ? (
          <p>
            允许后它将获得「{mcpLevels.assist.title}」权限：{mcpLevels.assist.description}。之后可以在「AI
            助手」里调整或移除。
          </p>
        ) : (
          <>
            <p>它想要：</p>
            <ul>
              {request.permissions.map((permission) => (
                <li key={permission}>{mcpPermissionLabels[permission]}</li>
              ))}
            </ul>
            <p className={styles.muted}>选「一直允许」以后不再询问；选「仅这一次」只放行这一次操作。</p>
          </>
        )}
        {connect && (
          <p className={styles.muted}>
            这是手动添加的连接，重启后需要重新允许。在「AI 助手」里一键连接可以避免反复确认。如果你没有在用 AI
            工具，请点「拒绝」。
          </p>
        )}
        {waiting.length > 1 && <p className={styles.muted}>还有 {waiting.length - 1} 条请求等你处理。</p>}
      </div>
    </Dialog>
  );
}
