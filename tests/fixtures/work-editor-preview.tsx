import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppearanceProvider } from "../../apps/desktop/src/renderer/shell/Appearance";
import { AppShell } from "../../apps/desktop/src/renderer/shell/AppShell";
import type {
  GlazeBridge,
  WorkEditorDocument,
  WorkEditorOptions,
  WorkRecord,
  WorkSummary,
} from "../../packages/contracts/src";
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
  ],
};
const requests: { method: string; params: unknown }[] = [];
const workList = [work];
const documents = new Map([[work.itemId, document]]);
const creationResult = new URLSearchParams(location.search).get("creation");
/** Model the preload contract locally; this fixture has no network implementation */
const rpc = async (method: string, params?: unknown) => {
  requests.push({ method, params: structuredClone(params) });
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
      appointOnlineTime: null,
    },
    "works.editor": documents.get((params as { itemId?: string } | undefined)?.itemId ?? work.itemId),
    "works.options": options,
    "works.reviewFeedback": null,
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
    Object.assign(document.fields, (params as { patch: WorkRecord }).patch);
    work.name = String(document.fields.item_name);
    return { ok: true, value: undefined };
  }
  if (method === "works.submitReview") {
    document.status = "reviewing";
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
