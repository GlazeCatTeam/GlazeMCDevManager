import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadNavEntries } from "../../apps/desktop/src/renderer/shell/nav";
import { Sidebar } from "../../apps/desktop/src/renderer/shell/Sidebar";
import type {
  AccountSummary,
  BannerApplication,
  GlazeBridge,
  PromotionActivity,
  RpcMethods,
} from "../../packages/contracts/src";
import { SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { PromotionPage } from "../../plugins/promotion/src";
import fluent from "../../themes/fluent-dark/theme.json";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

const account: AccountSummary = {
  id: "promotion-a",
  nickname: "琉璃工坊",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
const now = Math.floor(Date.now() / 1000);
const richDescriptions = new URLSearchParams(location.search).has("richDescriptions");
const activity: PromotionActivity = {
  id: "a1",
  name: "秋日创作季 · 探索无限可能",
  description: richDescriptions
    ? '<p style="color: #ff0000; font-size: 72px" onclick="document.body.dataset.unsafeActivity=1">奏鸣不息的机械纪元降临！<br>“机械工业”模组节征集活动现已开启！<br>邀请开发者携 <strong>机械工业主题模组</strong> 参与活动。</p><p>报名须知：</p><ol><li>请在作品介绍中填写推荐文案。</li><li>参与活动的模组需为已上架状态。</li></ol><p>征集时间：即日起至 2026 年 10 月 31 日<br>示例文本：A &amp; B，价格 &lt; 100</p><script>document.body.dataset.unsafeActivity=1</script><a href="javascript:alert(1)">更多说明</a>'
    : "用方块搭建你的奇思妙想。带上独特的玩法与故事，和玩家一起开启新的冒险。",
  instruction: richDescriptions
    ? "<p>活动规则与资格说明<br>请确保作品符合 <strong>原创要求</strong>。</p><ul><li>完整填写作品信息</li><li>结果以平台通知为准</li></ul>"
    : "报名作品须符合本期赛道要求。请完整填写作品介绍，报名后的审核结果以平台通知为准。",
  banner: null,
  beginAt: now - 86400,
  applyEndAt: now + 86400 * 14,
  endAt: now + 86400 * 30,
  modules: [
    {
      id: "1",
      name: "玩法创作",
      description: "选择符合条件的原创作品，为玩家带来新的探索体验。",
      minDiscount: 30,
      maxDiscount: 80,
      minDiamond: 100,
      priceUpdateDays: 30,
    },
    {
      id: "2",
      name: "冒险地图",
      description: "用故事与场景构建一段旅程。",
      minDiscount: 30,
      maxDiscount: 80,
      minDiamond: 100,
      priceUpdateDays: 30,
    },
  ],
  partitions: [{ id: "p1", name: "人气精选", rule: "根据平台规则审核入选" }],
};
const candidates = [
  { id: "10001", name: "风起之岛 · 浮空群岛生存", price: 600, priceType: "diamond", status: "", discount: null },
  { id: "10002", name: "林间手记 · 治愈系冒险", price: 300, priceType: "diamond", status: "", discount: null },
  { id: "10003", name: "遗迹探索者", price: 200, priceType: "diamond", status: "", discount: null },
];
const registered = new Set<string>();
let failed = false;
let uncertain = false;
const applications: BannerApplication[] = [
  {
    id: "application1",
    itemId: "10001",
    itemName: "风起之岛 · 浮空群岛生存",
    startTime: now + 86400,
    applyTime: now,
    imageUrl: "",
    extra: "适合喜欢探索的玩家",
    feature: "自由探索浮空群岛",
    update: "新增三处岛屿",
    activity: "秋日探索计划",
    status: "reviewing_1",
    position: "PE 首页轮播图",
  },
];
let writes = 0;
let moduleReads = 0;
let serverEnded = false;

/** Mock only the host boundary; use production navigation, queries, components and styles */
const rpc: GlazeBridge["rpc"] = async (method, params) => {
  const query = params as { account: string; page?: number; kind?: string; moduleId?: string };
  const failNow = failed;
  await new Promise((resolve) => setTimeout(resolve, query.account === account.id ? 80 : 10));
  if (failNow) return { ok: false, error: { kind: "network", message: "模拟网络不可用" } };
  let value: unknown;
  const empty = query.account !== account.id;
  switch (method) {
    case "promotion.activities":
      value = {
        records: empty
          ? []
          : query.page
            ? [{ ...activity, id: "a-old", name: "往期创作活动", applyEndAt: now - 1, endAt: now - 1 }]
            : [activity, { ...activity, id: "a2", name: "方块世界 · 建筑主题征集", beginAt: now + 86400 }],
        total: empty ? 0 : 11,
      };
      break;
    case "promotion.discount":
      value = { activity: empty ? null : { ...activity, name: "秋日精选 · 限时特卖" } };
      break;
    case "promotion.module": {
      const counter = document.getElementById("module-reads");
      if (counter) counter.textContent = String(++moduleReads);
      if (serverEnded) return { ok: false, error: { kind: "business", message: "活动已结束" } };
      value = {
        candidates: query.moduleId === "2" ? [] : candidates,
        joined: candidates
          .filter((item) => registered.has(`${query.kind}:${item.id}`))
          .map((item) => ({ ...item, status: "reviewing", discount: 60 })),
      };
      break;
    }
    case "works.list":
      value = empty ? [] : candidates.map((item) => ({ itemId: item.id, name: item.name, status: "online" }));
      break;
    case "works.get": {
      const { itemId } = params as RpcMethods["works.get"]["params"];
      value = {
        itemId,
        name: candidates.find((item) => item.id === itemId)?.name ?? "作品",
        iconUrl: itemId === "10003" ? null : `https://resource-minecraft.hzhf.netease.com/preview-icon-${itemId}.png`,
        bannerUrl: null,
        onlineTime: null,
        firstOnlineTime: null,
      };
      break;
    }
    case "promotion.dates":
      value = {
        dates: empty
          ? []
          : [
              { time: now + 86400, allowed: true, reason: "", recent: false },
              { time: now + 86400 * 8, allowed: false, reason: "近期已申请", recent: true },
            ],
      };
      break;
    case "promotion.applications":
      value = { records: empty ? [] : applications, total: empty ? 0 : applications.length };
      break;
    case "promotion.prepareImage": {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 700;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.fillStyle = "#163e38";
      context.fillRect(0, 0, 1200, 700);
      context.fillStyle = "#83b999";
      context.fillRect(80, 200, 500, 140);
      context.fillStyle = "#376b5b";
      context.fillRect(140, 340, 380, 160);
      context.fillStyle = "#d9ebd4";
      context.font = "bold 56px sans-serif";
      context.fillText("风起之岛", 650, 310);
      context.font = "24px sans-serif";
      context.fillText("探索浮空群岛 · 开启新的冒险", 650, 365);
      value = {
        token: "fixture-image",
        width: 1200,
        height: 700,
        targetWidth: 940,
        targetHeight: 450,
        preview: canvas.toDataURL("image/png").split(",")[1],
      };
      break;
    }
    case "promotion.discardImage":
      break;
    case "promotion.uploadImage":
    case "promotion.upload":
      value = {
        name: (params as { kind?: string }).kind === "video" ? "宣传视频.mp4" : "宣传图.png",
        size: 1024,
        url: "https://x19.fp.ps.netease.com/promotion-fixture.png",
        receipt: {
          body: "{}",
          sign: "test",
          file_type: (params as { kind?: string }).kind === "video" ? "video" : "image",
        },
      };
      break;
    case "promotion.join": {
      writes++;
      const counter = document.getElementById("writes");
      if (counter) counter.textContent = String(writes);
      if (uncertain) return { ok: false, error: { kind: "timeout", message: "模拟超时" } };
      const join = params as RpcMethods["promotion.join"]["params"];
      for (const id of join.itemIds) registered.add(`${join.kind}:${id}`);
      break;
    }
    case "promotion.cancelDiscount": {
      writes++;
      const counter = document.getElementById("writes");
      if (counter) counter.textContent = String(writes);
      const cancel = params as RpcMethods["promotion.cancelDiscount"]["params"];
      registered.delete(`discount:${cancel.itemId}`);
      break;
    }
    case "promotion.saveBanner": {
      writes++;
      const counter = document.getElementById("writes");
      if (counter) counter.textContent = String(writes);
      if (uncertain) return { ok: false, error: { kind: "timeout", message: "模拟超时" } };
      const form = params as RpcMethods["promotion.saveBanner"]["params"];
      applications.unshift({
        ...form,
        id: form.applicationId ?? `application${writes + 1}`,
        itemName: candidates.find((item) => item.id === form.itemId)?.name ?? "作品",
        status: "reviewing",
        applyTime: now,
        position: "PE 首页轮播图",
      });
      break;
    }
    default:
      throw new Error(`Unexpected RPC ${method}`);
  }
  return { ok: true, value } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};
window.glaze = { rpc, on: () => () => {} };
applyTheme(oreUi);

/** Expose deterministic failure, account and theme controls outside the product UI */
function Preview() {
  const [other, setOther] = useState(false);
  const current = other ? { ...account, id: "promotion-b", nickname: "空账号" } : account;
  return (
    <>
      <div style={{ display: "flex", gap: 16, padding: 8 }}>
        <button type="button" onClick={() => applyTheme({ ...oreUi, defaultVariant: "light" })}>
          浅色
        </button>
        <button type="button" onClick={() => applyTheme(oreUi)}>
          深色
        </button>
        <button type="button" onClick={() => applyTheme(fluent)}>
          Fluent
        </button>
        <button type="button" onClick={() => setOther((value) => !value)}>
          切换账号
        </button>
        <label>
          <input
            type="checkbox"
            onChange={(event) => {
              failed = event.target.checked;
            }}
          />
          模拟失败
        </label>
        <label>
          <input
            type="checkbox"
            onChange={(event) => {
              uncertain = event.target.checked;
            }}
          />
          提交超时
        </label>
        <span>
          写入 <b id="writes">0</b>
        </span>
        <label>
          <input
            type="checkbox"
            onChange={(event) => {
              serverEnded = event.target.checked;
            }}
          />
          平台返回活动结束
        </label>
        <span>
          赛道读取 <b id="module-reads">0</b>
        </span>
      </div>
      <SessionProvider value={{ current, accounts: [current] }}>
        <div style={{ display: "flex", height: "calc(100vh - 40px)" }}>
          <Sidebar
            entries={loadNavEntries()}
            activeRoute="glaze.promotion/promotion"
            account={current}
            onNavigate={() => {}}
          />
          <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
            <PromotionPage />
          </main>
        </div>
      </SessionProvider>
    </>
  );
}
const container = document.getElementById("root");
if (!container) throw new Error("Missing preview root");
createRoot(container).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
