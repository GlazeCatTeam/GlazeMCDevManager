import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AccountSummary, GlazeBridge, PlayerFeedback } from "../../packages/contracts/src";
import { SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { FeedbackPage } from "../../plugins/community/src/FeedbackPage";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

const account: AccountSummary = {
  id: "feedback-a",
  nickname: "反馈测试",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
let failReads = false;
let failWrites = false;
let slow = false;
let reads = 0;
let writes = 0;
const replies = new Map<string, string>();
const rows: PlayerFeedback[] = Array.from({ length: 25 }, (_, index) => ({
  id: `fixture-${index}`,
  nickname: `测试玩家${index + 1}`,
  uid: String(1000 + index),
  work: "测试组件",
  content: `离线反馈 ${index + 1}：传送门无法打开`,
  createdAt: "2026-10-15 12:00:00",
  canReply: index !== 1,
  type: index === 2 ? "组件冲突" : "故障问题",
  images: [],
  conflicts: index === 2 ? ["测试冲突组件"] : [],
  ...(index === 1 ? { blockedReason: "平台已禁止回复此条反馈" } : {}),
  ...(index === 0 ? { log: { name: "反馈日志", url: "https://x19.fp.ps.netease.com/fixture.txt" } } : {}),
}));

/** Simulate delayed platform replies; no fixture request contacts NetEase */
const rpc: GlazeBridge["rpc"] = async (method, params) => {
  const query = params as {
    account?: string;
    start?: number;
    span?: number;
    type?: string;
    search?: string;
    id?: string;
    content?: string;
  };
  const failed = method === "feedback.reply" ? failWrites : failReads;
  if (method === "feedback.reply") writes++;
  else reads++;
  const counter = document.getElementById("counter");
  if (counter) counter.textContent = `读取 ${reads} 次 · 发送 ${writes} 次`;
  await new Promise((resolve) => setTimeout(resolve, slow ? 1500 : 120));
  if (failed) return { ok: false, error: { kind: "network", message: "测试网络失败" } };
  let value: unknown;
  if (method === "feedback.list") {
    const filtered =
      query.account === account.id
        ? rows.filter(
            (row) =>
              (!query.search || row.content.includes(query.search)) &&
              (!query.type ||
                (query.type === "4" ? row.type === "组件冲突" : query.type === "0" && row.type === "故障问题")),
          )
        : [];
    value = {
      entries: filtered
        .slice(query.start ?? 0, (query.start ?? 0) + (query.span ?? 20))
        .map((row) =>
          replies.has(row.id)
            ? { ...row, canReply: false, reply: { content: replies.get(row.id), createdAt: "" } }
            : row,
        ),
      total: filtered.length,
    };
  } else if (method === "feedback.reply") {
    replies.set(query.id ?? "", query.content ?? "");
  } else if (method === "feedback.log") value = "[INFO] 离线测试日志\n[WARN] Portal unavailable";
  else return { ok: false, error: { kind: "test", message: "未配置的测试接口" } };
  return { ok: true, value } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};
Object.assign(globalThis, { glaze: { rpc, on: () => () => {} } });

/** Account and failure controls exercise the production page */
function Fixture() {
  const [current, setCurrent] = useState<AccountSummary | null>(account);
  return (
    <SessionProvider value={{ current, accounts: [account] }}>
      <div style={{ padding: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setCurrent(account)}>
          账号 A
        </button>
        <button type="button" onClick={() => setCurrent({ ...account, id: "feedback-b" })}>
          账号 B
        </button>
        <button type="button" onClick={() => setCurrent(null)}>
          退出账号
        </button>
        <label>
          <input
            type="checkbox"
            onChange={(event) => {
              failReads = event.target.checked;
            }}
          />
          读取失败
        </label>
        <label>
          <input
            type="checkbox"
            onChange={(event) => {
              failWrites = event.target.checked;
            }}
          />
          回复失败
        </label>
        <label>
          <input
            type="checkbox"
            onChange={(event) => {
              slow = event.target.checked;
            }}
          />
          延迟响应
        </label>
        <span id="counter">读取 0 次 · 发送 0 次</span>
      </div>
      <FeedbackPage />
    </SessionProvider>
  );
}
applyTheme(oreUi);
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Fixture />
    </StrictMode>,
  );
