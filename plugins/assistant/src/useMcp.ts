import { type AccountSummary, callHost, type McpSnapshot, onHostEvent } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

/** Read MCP state, refresh on host events and keep stale responses from replacing newer ones */
export function useMcp() {
  const [snapshot, setSnapshot] = useState<McpSnapshot | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [error, setError] = useState("");
  const serial = useRef(0);
  const reload = useCallback(async () => {
    const turn = ++serial.current;
    try {
      const [state, users] = await Promise.all([callHost("mcp.snapshot"), callHost("account.list")]);
      if (turn !== serial.current) return;
      if (!state.ok) throw new Error(state.error.message);
      setSnapshot(state.value);
      setError("");
      if (users.ok) setAccounts(users.value);
    } catch (reason) {
      if (turn === serial.current) setError(reason instanceof Error ? reason.message : "读取 AI 连接状态失败");
    }
  }, []);
  useEffect(() => {
    void reload();
    const offMcp = onHostEvent("mcp.changed", () => void reload());
    const offAccount = onHostEvent("account.changed", () => void reload());
    // Connection state is pushed, but "last used" times and expiry still drift
    const timer = window.setInterval(() => void reload(), 15_000);
    return () => {
      serial.current++;
      offMcp();
      offAccount();
      window.clearInterval(timer);
    };
  }, [reload]);
  return { snapshot, accounts, error, reload };
}

/** Run one host call at a time and surface its error text */
export function useAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const run = useCallback(
    async (task: () => Promise<void>) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setMessage("");
      try {
        await task();
        await reload();
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "操作失败，请重试");
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [reload],
  );
  return { busy, message, setMessage, run };
}

/** Unwrap a host result or throw its message */
export function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** "3 分钟前" style relative time for activity lists */
export function ago(time: string | number | null): string {
  if (!time) return "还没用过";
  const seconds = Math.max(0, (Date.now() - new Date(time).getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} 小时前`;
  return new Date(time).toLocaleDateString();
}
