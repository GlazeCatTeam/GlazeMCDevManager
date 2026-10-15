import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppearanceProvider } from "../../apps/desktop/src/renderer/shell/Appearance";
import { AppShell } from "../../apps/desktop/src/renderer/shell/AppShell";
import type {
  GlazeBridge,
  WorkEditorDocument,
  WorkEditorOptions,
  WorkOperationMethod,
  WorkOperationParams,
  WorkRecord,
  WorkSummary,
} from "../../packages/contracts/src";
import { workOperationMethods, workOperationStates } from "../../packages/contracts/src";
import { applyTheme } from "../../packages/theme/src";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";
import { sanitizeWorkHtml } from "../../plugins/works/src/editor/rich-html";

const account = {
  id: "fixture-account",
  nickname: "测试开发者",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
const work: WorkSummary = {
  itemId: "1000000000000000001",
  name: "猫咖啡测试专用",
  status: "init",
  price: 0,
  priceType: "free",
  isOriginal: true,
  syncPc: false,
  isPrerequisite: false,
  weakOffline: false,
  weakOfflineReason: null,
  createTime: "2026-10-01 12:00:00",
  applyReviewTime: null,
};
const document: WorkEditorDocument = {
  itemId: work.itemId,
  status: "init",
  version: "3.4",
  modCode: "4383863",
  guides: [],
  fields: {
    item_name: work.name,
    is_domain_server_item: 0,
    is_original: true,
    tag: [
      { name: "剑", source: 0 },
      { name: "魔法", source: 0 },
    ],
    activity_desc: "",
    dlc_info: { dlc_switch: false, dlc_type: "off", master: {}, slave_list: [] },
    relate_item_id: "",
    sync_pc_flag: false,
    price: 0,
    price_type: "free",
    price_rank: -4,
    info: "<p>探索新的魔法材料，制作独特武器。</p>",
    pri_type: 2,
    sub_type: 2,
    mod_second_type: 1,
    mod_version: "3.9",
    label_type_list: [1, 2],
    mount_call_enabled: false,
    res: [{ res_name: "test-mod.zip", add_version: true, res_url: "", mc_version: [] }],
    prerequisite_items: [],
    channel: [],
    banner_pic: "",
    video_info_list: [],
    update_summary: "添加开发者日志",
    weak_offline: false,
    weak_offline_reason: "",
    sync_item_info: {
      item_name: work.name,
      pri_type: 1,
      sub_type: 1,
      tag: [],
      channel: [],
      brief: "",
      info: "",
      available_scope: "all",
      include_map: false,
      weak_offline: false,
      weak_offline_reason: "",
    },
  },
};
const options: WorkEditorOptions = {
  tags: ["剑", "魔法", "剑与魔法"],
  tagLimit: 5,
  peTypes: [{ id: 2, title: "add_ons" }],
  pcTypes: [{ id: 1, title: "基岩版组件" }],
  peSubTypes: { 2: [{ id: 2, title: "玩法拓展" }] },
  pcSubTypes: { 1: [{ id: 1, title: "玩法" }] },
  secondTypes: { 2: [{ id: 1, title: "大型玩法" }] },
  recommendTags: { 1: [{ id: 1, title: "生存" }], 2: [{ id: 2, title: "奇幻" }] },
  versions: ["3.9", "3.8"],
  peImages: [
    { id: 5, title: "组件 ICON", width: 1000, height: 1000, version: 3 },
    { id: 2, title: "pos机", width: 900, height: 580, version: 1 },
    ...[3, 4, 6].map((id, i) => ({ id, title: `轮播图${i + 1}`, width: 992, height: 558, version: 1 })),
  ],
  pcImages: [],
  pcTags: [],
  pcScopes: [{ id: "all", title: "全部" }],
  prices: [
    { id: "free", title: "免费", min: 0, max: 0, step: 0 },
    { id: "diamond", title: "钻石", min: 300, max: 20000, step: 100 },
    { id: "point", title: "绿宝石", min: 100, max: 10000, step: 100 },
  ],
};
const requests: { method: string; params: unknown }[] = [];
const performancePreview = new URLSearchParams(location.search).has("performance");
const actionsPreview = new URLSearchParams(location.search).has("actions");
const scheduledPreview = new URLSearchParams(location.search).has("scheduled");
let actionFailure = new URLSearchParams(location.search).get("actionFailure");
const workList = performancePreview
  ? Array.from({ length: 90 }, (_, i) => ({ ...work, itemId: String(1000 + i), name: `性能测试作品 ${i + 1}` }))
  : [work];
if (new URLSearchParams(location.search).has("currency")) {
  workList.splice(
    0,
    workList.length,
    { ...work, itemId: "2001", name: "钻石定价作品", price: 600, priceType: "diamond" },
    { ...work, itemId: "2002", name: "绿宝石定价作品", price: 1000, priceType: "point" },
    { ...work, itemId: "2003", name: "免费作品" },
  );
}
if (actionsPreview) {
  workList.splice(
    0,
    workList.length,
    ...(
      [
        { itemId: "3001", name: "审核中的测试作品", status: "reviewing" },
        { itemId: "3002", name: "待上架的测试作品", status: "accept" },
        { itemId: "3003", name: "待自测的测试作品", status: "init" },
        { itemId: "3004", name: "自测中的测试作品", status: "self_test" },
        { itemId: "3005", name: "待删除的测试作品", status: "init" },
        { itemId: "3006", name: "钻石定价测试作品", status: "online", price: 600, priceType: "diamond" },
        { itemId: "3007", name: "绿宝石定价测试作品", status: "online", price: 100, priceType: "point" },
        { itemId: "3008", name: "免费已上架作品", status: "online" },
        { itemId: "3009", name: "待定时上架的测试作品", status: scheduledPreview ? "appoint_online" : "accept" },
        { itemId: "3010", name: "末页待删除作品", status: "init" },
      ] as Partial<WorkSummary>[]
    ).map((entry) => ({ ...work, ...entry })),
  );
}
const documents = new Map(
  performancePreview || actionsPreview || new URLSearchParams(location.search).has("currency")
    ? workList.map(
        (entry) =>
          [
            entry.itemId,
            {
              ...document,
              itemId: entry.itemId,
              status: entry.status,
              fields: {
                ...document.fields,
                item_name: entry.name,
                price: entry.price,
                price_type: entry.priceType,
                price_rank: entry.priceType === "diamond" ? 1 : entry.priceType === "point" ? -5 : -4,
              },
            },
          ] as const,
      )
    : [[work.itemId, document]],
);
const creationResult = new URLSearchParams(location.search).get("creation");
const metrics = window.document.createElement("output");
if (performancePreview) {
  metrics.setAttribute("aria-label", "请求统计");
  metrics.style.cssText =
    "position:fixed;bottom:8px;right:16px;z-index:1000;padding:8px;background:#111;color:#fff;font-size:12px";
  window.document.body.append(metrics);
}
/** Model the preload contract locally; this fixture has no network implementation */
const rpc = async (method: string, params?: unknown) => {
  requests.push({ method, params: structuredClone(params) });
  if (workOperationMethods.includes(method as WorkOperationMethod)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const input = params as WorkOperationParams;
    const target = workList.find((entry) => entry.itemId === input.itemId);
    const doc = documents.get(input.itemId);
    if (actionFailure === "expired")
      return { ok: false, error: { kind: "session_expired", message: "模拟登录已过期" } };
    if (actionFailure === "reject")
      return { ok: false, error: { kind: "business", message: "模拟平台拒绝：当前作品不能执行此操作" } };
    if (actionFailure === "conflict" && target) target.status = "online";
    if (
      !target ||
      !doc ||
      target.status !== input.expectedStatus ||
      !workOperationStates[method as WorkOperationMethod].includes(target.status)
    )
      return { ok: false, error: { kind: "business", message: "作品状态已变化，请刷新列表后重新操作" } };
    if (method === "works.delete") workList.splice(workList.indexOf(target), 1);
    if (method === "works.cancelReview" || method === "works.cancelTest") target.status = "init";
    if (method === "works.submitSelfTest") target.status = input.passCheck ? "self_test" : "self_test_prepare";
    if (method === "works.publish") target.status = "online";
    if (method === "works.appointOnline") schedules.set(input.itemId, input.appointOnlineTime ?? null);
    if (method === "works.cancelAppointOnline") {
      schedules.delete(input.itemId);
      target.status = "accept";
    }
    if (method === "works.changePrice") {
      target.price = input.price ?? target.price;
      doc.fields.price = target.price;
    }
    doc.status = target.status;
    return { ok: true, value: { outcome: actionFailure === "uncertain" ? "uncertain" : "completed" } };
  }
  if (performancePreview)
    metrics.textContent = `分页 ${requests.filter((r) => r.method === "works.page").length} · 全量 ${requests.filter((r) => r.method === "works.list").length} · 封面 ${requests.filter((r) => r.method === "works.get").length}`;
  if (method === "works.page") {
    if (performancePreview) await new Promise((resolve) => setTimeout(resolve, 250));
    const { page, pageSize } = params as { page: number; pageSize: number };
    return {
      ok: true,
      value: { items: structuredClone(workList.slice(page * pageSize, (page + 1) * pageSize)), total: workList.length },
    };
  }
  if (performancePreview && method === "works.get") await new Promise((resolve) => setTimeout(resolve, 400));
  const values: Record<string, unknown> = {
    "app.getInitialRoute": { route: "glaze.works/works", params: {} },
    "window.getState": { maximized: false },
    "account.list": [account],
    "account.current": account,
    "works.list": workList,
    "works.get": {
      itemId: work.itemId,
      name: work.name,
      iconUrl: null,
      bannerUrl: null,
      onlineTime: null,
      firstOnlineTime: null,
      appointOnlineTime: schedules.get((params as { itemId?: string } | undefined)?.itemId ?? "") ?? null,
    },
    "works.editor": documents.get((params as { itemId?: string } | undefined)?.itemId ?? work.itemId),
    "works.options": options,
    "works.reviewFeedback": scheduledPreview ? { text: "审核通过，等待预约上架", time: null } : null,
  };
  if (method === "works.create") {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (creationResult === "timeout") return { ok: false, error: { kind: "timeout", message: "模拟请求超时" } };
    if (creationResult === "reject")
      return { ok: false, error: { kind: "business", message: "模拟平台拒绝：请完善作品信息" } };
    const fields = (params as { fields: WorkRecord }).fields;
    if (!fields.item_name || !Array.isArray(fields.res) || !fields.res.length)
      return { ok: false, error: { kind: "validation", message: "请填写名称并上传资源文件" } };
    const created = {
      ...work,
      itemId: String(2000 + workList.length),
      name: String(fields.item_name),
      price: Number(fields.price),
      priceType: fields.price_type === "diamond" ? ("diamond" as const) : ("free" as const),
    };
    workList.unshift(created);
    documents.set(created.itemId, {
      ...document,
      itemId: created.itemId,
      version: "0.1",
      fields: structuredClone(fields),
    });
    return { ok: true, value: undefined };
  }
  if (method === "works.save") {
    const input = params as { itemId: string; patch: WorkRecord };
    const target = documents.get(input.itemId);
    if (!target) return { ok: false, error: { kind: "fixture", message: "作品不存在" } };
    Object.assign(target.fields, input.patch);
    const summary = workList.find((entry) => entry.itemId === input.itemId);
    if (summary) summary.name = String(target.fields.item_name);
    return { ok: true, value: undefined };
  }
  if (method === "works.submitReview") {
    const target = documents.get((params as { itemId: string }).itemId);
    if (target) target.status = "reviewing";
    return { ok: true, value: { needCheckApply: false, queueLength: 2 } };
  }
  if (method === "works.upload" && (params as { kind: string }).kind === "resource")
    return {
      ok: true,
      value: {
        name: "new-mod.zip",
        size: 128,
        url: "https://x19.fp.ps.netease.com/fixture.zip",
        receipt: { body: "{}", sign: "fixture-signature", file_type: "zip_package" },
      },
    };
  if (method === "works.upload")
    return {
      ok: true,
      value:
        (params as { kind: string }).kind === "richImage"
          ? {
              name: "fixture.png",
              size: 1,
              url: "https://x19.fp.ps.netease.com/fixture.png",
              receipt: {
                body: '{"url":"https://x19.fp.ps.netease.com/fixture.png"}',
                sign: "fixture-signature",
                file_type: "image",
              },
            }
          : null,
    };
  return Object.hasOwn(values, method)
    ? { ok: true, value: structuredClone(values[method]) }
    : { ok: false, error: { kind: "fixture", message: `未模拟接口 ${method}` } };
};
Object.assign(globalThis, { glaze: { rpc, on: () => () => {} } as GlazeBridge });
const schedules = new Map<string, string | null>();
if (scheduledPreview) schedules.set("3009", "2099-01-01T10:30:00+08:00");
if (actionsPreview)
  Object.assign(globalThis, {
    workActionFixture: {
      requests,
      workList,
      fail: (value: string | null) => {
        actionFailure = value;
      },
    },
  });
applyTheme(oreUi);
// Browser-only checks exercise the sanitizer with real DOMParser behavior.
const cleaned = sanitizeWorkHtml(
  '<p onclick="alert(1)"><b>保留文字</b><script>alert(1)</script><a href="javascript:alert(1)">链接</a><img src="https://evil.example/a.png" onerror="alert(1)"><svg><script>alert(1)</script></svg></p>',
  true,
);
if (/onclick|onerror|<script|javascript:|evil\.example|<svg/.test(cleaned) || !cleaned.includes("<b>保留文字</b>"))
  throw new Error("富文本清理验证失败");
const proxied = sanitizeWorkHtml('<img src="https://x19.fp.ps.netease.com/example.png">', true);
if (!proxied.includes("glaze-image:") || sanitizeWorkHtml(proxied).includes("glaze-image:"))
  throw new Error("富文本图片代理往返验证失败");
console.info("富文本清理与图片代理往返检查通过");
const container = window.document.getElementById("root");
if (!container) throw new Error("Missing preview root");
createRoot(container).render(
  <StrictMode>
    <AppearanceProvider>
      <AppShell />
    </AppearanceProvider>
  </StrictMode>,
);
