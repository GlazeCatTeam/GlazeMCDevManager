import { useState } from "react";
import { createRoot } from "react-dom/client";
import { type AccountSummary, type GlazeBridge, type MessageSummary, messageTypes } from "../../packages/contracts/src";
import { SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { MessagesPage } from "../../plugins/messages/src/MessagesPage";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

const account: AccountSummary = {
  id: "messages-a",
  nickname: "消息测试",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
const mailboxes = new Map<string, MessageSummary[]>();
let activeAccount = account.id;
let failure = false;
let slow = false;
let requests = 0;

/** Create enough messages to exercise pagination independently for each test account */
function rowsFor(id: string): MessageSummary[] {
  let rows = mailboxes.get(id);
  if (!rows) {
    rows = Array.from({ length: id === account.id ? 25 : 2 }, (_, index) => ({
      id: `${id}-${index}`,
      title: `${id === account.id ? "甲" : "乙"}账号消息 ${index + 1}`,
      type: messageTypes[index % messageTypes.length] ?? "notify",
      sentAt: "2026-10-15 12:00",
      read: index % 3 === 0,
    }));
    mailboxes.set(id, rows);
  }
  return rows;
}

/** Mimic host results and detail read side effects without calling the real platform */
const rpc: GlazeBridge["rpc"] = async (method, params) => {
  const values = (params ?? {}) as Record<string, unknown>;
  const requestedAccount = String(values.account ?? activeAccount);
  const failed = failure;
  const counter = document.getElementById("calls");
  if (counter) counter.textContent = `请求数：${++requests}`;
  await new Promise((resolve) => setTimeout(resolve, slow ? 1500 : 80));
  if (failed) return { ok: false, error: { kind: "network", message: "离线测试请求失败" } };
  if (method !== "messages.list" && requestedAccount !== activeAccount)
    return { ok: false, error: { kind: "account_changed", message: "账号已切换" } };
  const rows = rowsFor(requestedAccount);
  let value: unknown;
  if (method === "messages.list") {
    const filtered = rows.filter(
      (row) =>
        (!values.title || row.title.includes(String(values.title))) &&
        (!values.type || row.type === values.type) &&
        (values.read === undefined || row.read === values.read),
    );
    value = {
      messages: filtered.slice(Number(values.start ?? 0), Number(values.start ?? 0) + Number(values.span ?? 20)),
      total: filtered.length,
      unread: rows.filter((row) => !row.read).length,
      unreadByType: Object.fromEntries(
        messageTypes.map((type) => [type, rows.filter((row) => !row.read && row.type === type).length]),
      ),
    };
  } else if (method === "messages.get") {
    const row = rows.find((item) => item.id === values.id);
    if (row) row.read = true;
    value = {
      text: "<p>来自平台的消息正文</p><p>第二段 &amp; 安全显示</p><script>alert(1)</script>",
      sender: "平台测试",
      extra: ["附加信息测试"],
    };
  } else if (method === "messages.delete") {
    mailboxes.set(
      requestedAccount,
      rows.filter((row) => !(values.ids as string[]).includes(row.id)),
    );
  } else if (method === "messages.markAllRead") {
    for (const row of rows) row.read = true;
  } else return { ok: false, error: { kind: "fixture", message: `未模拟 ${method}` } };
  return { ok: true, value: structuredClone(value) } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};
Object.assign(globalThis, { glaze: { rpc, on: () => () => {} } });
applyTheme(oreUi);

/** Visible test controls exercise failures, delayed results and account switching */
function Preview() {
  const [current, setCurrent] = useState(account);
  const [failed, setFailed] = useState(false);
  const [delayed, setDelayed] = useState(false);
  return (
    <SessionProvider value={{ current, accounts: [current] }}>
      <div style={{ padding: 12, display: "flex", gap: 24 }}>
        <button
          type="button"
          onClick={() => {
            failure = !failure;
            setFailed(failure);
          }}
        >
          {failed ? "恢复请求" : "模拟请求失败"}
        </button>
        <button
          type="button"
          onClick={() => {
            slow = !slow;
            setDelayed(slow);
          }}
        >
          {delayed ? "恢复速度" : "延迟请求"}
        </button>
        <button
          type="button"
          onClick={() => {
            activeAccount = current.id === account.id ? "messages-b" : account.id;
            setCurrent({ ...account, id: activeAccount });
          }}
        >
          切换测试账号
        </button>
        <output id="calls">请求数：0</output>
      </div>
      <MessagesPage />
    </SessionProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root");
createRoot(root).render(<Preview />);
