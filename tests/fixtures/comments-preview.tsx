import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type AccountSummary,
  type CommentListParams,
  type CommentReplyParams,
  commentTypes,
  type GlazeBridge,
  type PlayerComment,
} from "../../packages/contracts/src";
import { SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { CommentsPage } from "../../plugins/community/src/CommentsPage";
import fluent from "../../themes/fluent-dark/theme.json";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

const account: AccountSummary = {
  id: "comments-a",
  nickname: "评论测试",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
let failure = false;
let delay = 100;
let replyRequests = 0;
let listRequests = 0;
const sentReplies = new Map<string, string>();
const sparseRatings = new URLSearchParams(location.search).has("sparse-ratings");
const progressive = new URLSearchParams(location.search).has("progressive");
const emptyContent = new URLSearchParams(location.search).has("empty-content");
const longContent = new URLSearchParams(location.search).has("long-content");
const outOfOrder = new URLSearchParams(location.search).has("out-of-order");
const completedQueries: string[] = [];
let failLater = new URLSearchParams(location.search).has("fail-later");

/** Fixture bridge supports pagination, filtering, failures and intentionally late responses */
const rpc: GlazeBridge["rpc"] = async (method, input) => {
  if (method === "comments.reply") {
    const params = input as CommentReplyParams;
    replyRequests++;
    const count = document.getElementById("reply-count");
    if (count) count.textContent = `回复请求数：${replyRequests}`;
    const failed = failure;
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (failed) return { ok: false, error: { kind: "business", message: "离线测试拒绝回复" } };
    sentReplies.set(params.id, params.content);
    return { ok: true, value: undefined } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
  }
  if (method !== "comments.list") throw new Error(`Unexpected method: ${method}`);
  const params = input as CommentListParams;
  listRequests++;
  const listCount = document.getElementById("list-count");
  if (listCount) listCount.textContent = `列表请求数：${listRequests}`;
  const output = document.getElementById("query");
  if (output) output.textContent = JSON.stringify(params);
  const failed = failure || (failLater && params.start >= 100);
  if (params.start >= 100) failLater = false;
  const latency =
    outOfOrder && params.keyword
      ? params.keyword === "玩家甲22"
        ? 3000
        : 100
      : progressive && params.start >= 100
        ? 1500
        : delay;
  await new Promise((resolve) => setTimeout(resolve, latency));
  completedQueries.push(params.keyword ?? "");
  if (failed) return { ok: false, error: { kind: "network", message: "离线测试网络失败" } };
  const items: PlayerComment[] = Array.from(
    { length: params.account === account.id ? (progressive ? 230 : sparseRatings ? 30 : 43) : 1 },
    (_, index) => ({
      id: `${params.account}-${index}`,
      resourceId: "4686664860310207622",
      nickname: `${params.account === account.id ? "玩家甲" : "玩家乙"}${index + 1}`,
      uid: String(12345 + index),
      work: "空岛奇境",
      stars: sparseRatings ? (index === 0 || index === (progressive ? 121 : 21) ? 1 : 5) : (index % 5) + 1,
      publishTime: Math.floor(new Date(2026, 9, 15 - index, 14, 30).getTime() / 1000),
      content:
        longContent && index === 0
          ? "希望增加更多冒险地图。\n".repeat(80)
          : emptyContent && index % 3 === 0
            ? index % 6 === 0
              ? ""
              : " \n\t　"
            : index === 0
              ? "非常喜欢这个组件，希望增加更多冒险地图。"
              : `评论内容 ${index + 1}`,
      tag: index % 2 ? "问题求助" : "默认类型",
      canReply: index !== 2 && !sentReplies.has(`${params.account}-${index}`),
      ...(sentReplies.has(`${params.account}-${index}`)
        ? { reply: { content: sentReplies.get(`${params.account}-${index}`) ?? "", createdAt: "" } }
        : index === 2
          ? { reply: { content: "谢谢支持，已收到建议", createdAt: "" } }
          : {}),
    }),
  ).filter(
    (item) =>
      (!params.keyword || `${item.nickname}${item.content}${item.work}`.includes(params.keyword)) &&
      (params.tag === undefined || item.tag === commentTypes.find((type) => type.code === params.tag)?.label) &&
      (!params.startDate || item.publishTime >= new Date(`${params.startDate}T00:00:00`).getTime() / 1000) &&
      (!params.endDate || item.publishTime <= new Date(`${params.endDate}T23:59:59`).getTime() / 1000),
  );
  return {
    ok: true,
    value: { total: items.length, items: items.slice(params.start, params.start + params.span) },
  } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};
Object.assign(globalThis, { glaze: { rpc, on: () => () => {} }, commentTest: { completedQueries } });
applyTheme(
  new URLSearchParams(location.search).get("theme") === "fluent" ? fluent : oreUi,
  new URLSearchParams(location.search).get("variant") ?? "dark",
);

/** Visible test controls never use actual sessions or contact the platform */
function Preview() {
  const [current, setCurrent] = useState<AccountSummary | null>(account);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  return (
    <SessionProvider value={{ current, accounts: current ? [current] : [] }}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            height: 90,
            flex: "none",
            overflow: "auto",
            padding: 12,
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
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
            onClick={() => setCurrent({ ...account, id: current?.id === account.id ? "comments-b" : account.id })}
          >
            切换测试账号
          </button>
          <button type="button" onClick={() => setCurrent(null)}>
            退出测试账号
          </button>
          <button
            type="button"
            onClick={() => {
              delay = slow ? 100 : 2000;
              setSlow(!slow);
            }}
          >
            {slow ? "正常延迟" : "慢速请求"}
          </button>
          <output id="query" />
          <output id="list-count">列表请求数：0</output>
          <output id="reply-count">回复请求数：0</output>
        </div>
        <main aria-label="评论测试页面" style={{ flex: 1, minHeight: 0, overflow: "auto", scrollbarGutter: "stable" }}>
          <CommentsPage />
        </main>
      </div>
    </SessionProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing preview root");
createRoot(container).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
