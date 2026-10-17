import assert from "node:assert/strict";
import "./work-advanced.test";
import { afterEach, test } from "node:test";
import { createWorkOperationHandlers } from "../apps/desktop/src/main/ipc/work-operations";
import { validateWorkVideo } from "../apps/desktop/src/main/ipc/work-video";
import { capabilities } from "../packages/contracts/src/rpc/capabilities";
import { emptyWorkCreateFields, isWorkCreateParams } from "../packages/contracts/src/rpc/work-create";
import { isWorkSaveParams } from "../packages/contracts/src/rpc/work-editor";
import {
  isWorkOperationParams,
  type WorkOperationMethod,
  type WorkOperationParams,
  workOperationMethods,
  workScheduleTime,
} from "../packages/contracts/src/rpc/work-operations";
import type { WorkSummary } from "../packages/contracts/src/rpc/works";
import { buildWorkCreate, createWork } from "../packages/netease/src/endpoints/work-create";
import {
  buildWorkUpdate,
  getWorkEditorOptions,
  readWorkEditor,
  saveWorkEditor,
  submitWorkReview,
  validateWorkPatch,
  workEditorFields,
} from "../packages/netease/src/endpoints/work-editor";
import { performWorkOperation } from "../packages/netease/src/endpoints/work-operations";
import {
  parseWorkUploadReply,
  resolveWorkUploadUrl,
  uploadWorkFile,
} from "../packages/netease/src/endpoints/work-upload";
import { getWorksPage, listWorks, readWorkStatus } from "../packages/netease/src/endpoints/works";
import { getMcDevData, parsePlatformJson, writeMcDevData } from "../packages/netease/src/http/client";
import { archiveWorkPage } from "../plugins/works/src/archive";
import { WorkQueryCache } from "../plugins/works/src/query-cache";
import { actionsFor, statusLabels, statusTones } from "../plugins/works/src/status";
import {
  clearWorkReads,
  invalidateWorks,
  preloadNextWorksPage,
  preloadWorkEditor,
  preloadWorkOptions,
  preloadWorksPage,
} from "../plugins/works/src/useWorkQuery";
import {
  clearWorkListPositions,
  rememberWorkListPosition,
  selectWorkListView,
  workListPosition,
} from "../plugins/works/src/view-state";
import { startWorksWarmup } from "../plugins/works/src/warmup";

const originalFetch = globalThis.fetch;

test("archive filtering fills pages before slicing and handles empty or stale archives", () => {
  const works = Array.from({ length: 10 }, (_, i) => ({ itemId: String(i) }) as WorkSummary);
  const normal = archiveWorkPage(works, ["0", "4", "missing"], false, 0, 9);
  assert.equal(normal.total, 8);
  assert.deepEqual(
    normal.items.map((work) => work.itemId),
    ["1", "2", "3", "5", "6", "7", "8", "9"],
  );
  const archived = archiveWorkPage(works, ["0", "4", "missing"], true, 0, 9);
  assert.equal(archived.total, 2);
  assert.deepEqual(
    archived.items.map((work) => work.itemId),
    ["0", "4"],
  );
  assert.deepEqual(archiveWorkPage(works, [], true, 0, 9), { items: [], total: 0 });
  assert.deepEqual(
    archiveWorkPage(
      works,
      works.map((work) => work.itemId),
      false,
      0,
      9,
    ),
    { items: [], total: 0 },
  );
  assert.deepEqual(archiveWorkPage(works, ["9"], false, 1, 9), { items: [], total: 9 });
});

test("list operation contracts reject unknown fields, invalid states, dates and prices", () => {
  const base = { account: "a", itemId: "4686664860310207622", expectedStatus: "accept" };
  assert.equal(isWorkOperationParams("works.publish", base), true);
  for (const patch of [{ itemId: "../1" }, { account: " " }, { expectedStatus: "online" }, { op_platform: "pe" }])
    assert.equal(isWorkOperationParams("works.publish", { ...base, ...patch }), false);
  assert.equal(isWorkOperationParams("works.submitSelfTest", { ...base, expectedStatus: "init" }), false);
  assert.equal(
    isWorkOperationParams("works.submitSelfTest", { ...base, expectedStatus: "init", passCheck: false }),
    true,
  );
  assert.equal(workScheduleTime("2028-02-29 12:30:00"), Date.parse("2028-02-29T04:30:00Z"));
  for (const date of [
    "2027-02-29 12:30:00",
    "2028-02-30 12:00:00",
    "2028-01-01 24:00:00",
    "2028-01-01T12:00:00",
    "2028-01-01 12:00:00Z",
  ])
    assert.equal(workScheduleTime(date), null);
  for (const price of [0, -1, 601, 1.5, Number.NaN, 600])
    assert.equal(
      isWorkOperationParams("works.changePrice", {
        ...base,
        expectedStatus: "online",
        expectedPrice: 600,
        expectedPriceType: "diamond",
        price,
      }),
      false,
    );
  for (const method of workOperationMethods) {
    assert.equal(capabilities[method].caller, "shell");
    assert.equal(capabilities[method].mcp, undefined);
  }
  assert.equal(capabilities["works.delete"].risk, "dangerous");
});

test("list operations use exact verbs, paths and minimal wire bodies", async () => {
  const cases: [WorkOperationMethod, Partial<WorkOperationParams>, string, string, unknown][] = [
    ["works.cancelReview", { expectedStatus: "reviewing" }, "PUT", "/cancel_review", undefined],
    ["works.publish", { expectedStatus: "accept" }, "PUT", "/online", { op_platform: "all" }],
    [
      "works.cancelAppointOnline",
      { expectedStatus: "appoint_online" },
      "PUT",
      "/appoint_online",
      { appoint_online_time: null },
    ],
    [
      "works.appointOnline",
      { expectedStatus: "accept", appointOnlineTime: "2099-01-01 10:30:00" },
      "PUT",
      "/appoint_online",
      { appoint_online_time: "2099-01-01 10:30:00", op_platform: "all" },
    ],
    [
      "works.submitSelfTest",
      { expectedStatus: "init", passCheck: false },
      "PUT",
      "/self-test-apply",
      { pass_check: false },
    ],
    ["works.cancelTest", { expectedStatus: "self_test" }, "PUT", "/cancel_self_test", undefined],
    ["works.delete", { expectedStatus: "init" }, "DELETE", "", undefined],
    [
      "works.changePrice",
      { expectedStatus: "online", expectedPrice: 600, expectedPriceType: "diamond", price: 1000 },
      "POST",
      "/change_price",
      { price: 1000, price_type: "diamond", price_rank: 2 },
    ],
  ];
  for (const [method, input, verb, suffix, body] of cases) {
    const params = { account: "a", itemId, ...input } as WorkOperationParams;
    const calls = mockFetch((url, init) => {
      if (init.method !== "GET") return response();
      if (url.endsWith("/items/mc_consts/")) return response(createConstants);
      if (url.endsWith("/item-tag/")) return response({ tag_list: [] });
      return response({ ...fixture, status: params.expectedStatus, price_type: "diamond", price: 600, price_rank: 1 });
    });
    assert.deepEqual(await performWorkOperation(session, method, params), {
      ok: true,
      value: { outcome: "completed" },
    });
    const writes = calls.filter((c) => c.init.method !== "GET");
    assert.equal(writes.length, 1, method);
    assert.equal(writes[0].init.method, verb);
    assert.ok(writes[0].url.endsWith(`/items/categories/pe/${itemId}${suffix}`));
    assert.deepEqual(writes[0].init.body === undefined ? undefined : JSON.parse(String(writes[0].init.body)), body);
    assert.equal(writes[0].init.redirect, "manual");
  }
});

test("schedule cancellation rejects changed state, retains rejection and never retries an uncertain write", async () => {
  const params = { account: "a", itemId, expectedStatus: "appoint_online" } as const;
  assert.equal(isWorkOperationParams("works.cancelAppointOnline", { ...params, expectedStatus: "accept" }), false);
  assert.equal(isWorkOperationParams("works.cancelAppointOnline", { ...params, appointOnlineTime: null }), false);
  for (const scenario of ["already-online", "rejected", "network"]) {
    const calls = mockFetch((_url, init) => {
      if (init.method === "GET")
        return response({ ...fixture, status: scenario === "already-online" ? "online" : "appoint_online" });
      if (scenario === "network") throw new Error("connection lost");
      return response({}, "not_allowed");
    });
    const result = await performWorkOperation(session, "works.cancelAppointOnline", params);
    assert.equal(result.ok, scenario === "network");
    if (result.ok) assert.equal(result.value.outcome, "uncertain");
    assert.equal(calls.filter((call) => call.init.method !== "GET").length, scenario === "already-online" ? 0 : 1);
  }
});

test("precondition failures never write or retry", async () => {
  for (const method of workOperationMethods.filter((m) => m !== "works.changePrice")) {
    const states = {
      "works.cancelReview": "reviewing",
      "works.publish": "accept",
      "works.appointOnline": "accept",
      "works.cancelAppointOnline": "appoint_online",
      "works.submitSelfTest": "init",
      "works.cancelTest": "self_test",
      "works.delete": "init",
    };
    const params = {
      account: "a",
      itemId,
      expectedStatus: states[method as keyof typeof states],
      ...(method === "works.appointOnline" ? { appointOnlineTime: "2099-01-01 12:00:00" } : {}),
      ...(method === "works.submitSelfTest" ? { passCheck: true } : {}),
    } as WorkOperationParams;
    const calls = mockFetch(() => response({ ...fixture, status: "unknown" }));
    assert.equal((await performWorkOperation(session, method, params)).ok, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, "GET");
  }
  const calls = mockFetch(() => response({ ...fixture, status: "accept" }));
  assert.equal(
    (
      await performWorkOperation(session, "works.appointOnline", {
        account: "a",
        itemId,
        expectedStatus: "accept",
        appointOnlineTime: "2000-01-01 00:00:00",
      })
    ).ok,
    false,
  );
  assert.equal(calls.length, 1);
  calls.length = 0;
  assert.equal(
    (await performWorkOperation(session, "works.delete", { account: "a", itemId: "../bad", expectedStatus: "init" }))
      .ok,
    false,
  );
  assert.equal(calls.length, 0);
});

test("price changes preserve emerald rank and enforce live rules and the old price", async () => {
  const params: WorkOperationParams = {
    account: "a",
    itemId,
    expectedStatus: "online",
    expectedPrice: 100,
    expectedPriceType: "point",
    price: 200,
  };
  for (const scenario of [
    "success",
    "changed-price",
    "changed-currency",
    "prerequisite",
    "missing-rule",
    "range",
    "step",
  ]) {
    const calls = mockFetch((url, init) => {
      if (init.method !== "GET") return response();
      if (url.endsWith("/item-tag/")) return response({ tag_list: [] });
      if (url.endsWith("/items/mc_consts/"))
        return response({
          ...createConstants,
          price_type:
            scenario === "missing-rule"
              ? []
              : [{ id: "point", min: 0, max: scenario === "range" ? 150 : 1000, step: scenario === "step" ? 30 : 100 }],
        });
      return response({
        ...fixture,
        pri_type: scenario === "prerequisite" ? 9 : 2,
        price: scenario === "changed-price" ? 300 : 100,
        price_type: scenario === "changed-currency" ? "free" : "point",
        price_rank: -5,
      });
    });
    const result = await performWorkOperation(session, "works.changePrice", params);
    assert.equal(result.ok, scenario === "success", scenario);
    const writes = calls.filter((c) => c.init.method !== "GET");
    assert.equal(writes.length, scenario === "success" ? 1 : 0);
    if (writes.length)
      assert.deepEqual(JSON.parse(String(writes[0].init.body)), { price: 200, price_type: "point", price_rank: -5 });
  }
});

test("ambiguous write replies return unknown outcome and never replay writes", async () => {
  for (const scenario of ["timeout", "network", "parse", "http500"]) {
    const calls = mockFetch((_url, init) => {
      if (init.method === "GET") return response({ ...fixture, status: "init" });
      if (scenario === "timeout") throw new DOMException("test", "TimeoutError");
      if (scenario === "network") throw new Error("connection lost");
      if (scenario === "http500") return new Response('{"status":"error","msg":"unknown"}', { status: 500 });
      return new Response("invalid json");
    });
    assert.deepEqual(
      await performWorkOperation(session, "works.delete", { account: "a", itemId, expectedStatus: "init" }),
      { ok: true, value: { outcome: "uncertain" } },
    );
    assert.equal(calls.length, 2);
  }
});

test("business rejection, expiry and redirects remain failures without replay", async () => {
  for (const scenario of ["rejection", "expired", "redirect"]) {
    const calls = mockFetch((_url, init) => {
      if (init.method === "GET") return response({ ...fixture, status: "reviewing" });
      if (scenario === "redirect") return new Response(null, { status: 308, headers: { location: "/other" } });
      return response({}, scenario === "expired" ? "no_login" : "not_allowed");
    });
    assert.equal(
      (await performWorkOperation(session, "works.cancelReview", { account: "a", itemId, expectedStatus: "reviewing" }))
        .ok,
      false,
    );
    assert.equal(calls.length, 2);
  }
});

test("host rejects concurrent writes and an account switch during preflight", async () => {
  let currentAccount = "a";
  let release: () => void = () => {};
  let started: () => void = () => {};
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls = mockFetch(async () => {
    started();
    await waiting;
    return response({ ...fixture, status: "init" });
  });
  const sessions = {
    current: () => ({ id: currentAccount }),
    request: async (_account: string, call: (s: typeof session) => Promise<{ ok: boolean; value?: unknown }>) => {
      const result = await call(session);
      if (!result.ok) throw new Error("fixture platform failure");
      return result.value;
    },
  } as Parameters<typeof createWorkOperationHandlers>[0];
  const handlers = createWorkOperationHandlers(sessions);
  const params: WorkOperationParams = { account: "a", itemId, expectedStatus: "init" };
  const first = handlers["works.delete"](params);
  await began;
  await assert.rejects(handlers["works.delete"](params), /正在操作/);
  currentAccount = "b";
  release();
  await assert.rejects(first, /账号已切换/);
  assert.equal(calls.length, 1);
  await assert.rejects(handlers["works.delete"](params), /账号已切换/);
  assert.equal(calls.length, 1);
  currentAccount = "a";
  mockFetch((_url, init) => (init.method === "GET" ? response({ ...fixture, status: "init" }) : response()));
  assert.deepEqual(await handlers["works.delete"](params), { outcome: "completed" });
});
const hostGlobal = globalThis as typeof globalThis & { glaze?: unknown };
const originalBridge = hostGlobal.glaze;
const session = { sessionCookie: "unit-test-session" };
const itemId = "4686664860310207622";
const fixture = {
  item_id: itemId,
  item_name: "测试模组",
  status: "online",
  item_version: "3.4",
  normal_number: "4383863",
  tags: [{ name: "魔法", source: 0 }],
  info: "<p>原介绍</p>",
  activity_desc: "私有活动说明",
  price_type: "free",
  price: 0,
  price_rank: -4,
  pri_type: 2,
  sub_type: 2,
  sync_pc_flag: false,
  is_original: true,
  pe_is_add_play_plan: true,
  play_plan_expire_time: 4102444800,
  relate_item_id: "4669876470260845864",
  mc_version: '["1.21"]',
  whitelist: '["player-1"]',
  dlc_info: { dlc_switch: false, dlc_type: "off", master: "{}", slave_list: "[]" },
  res: [
    {
      res_name: "existing.zip",
      res_url: "",
      add_version: false,
      cdn_info: { token: "platform-resource-metadata" },
      res_id: 42,
    },
  ],
  channel: [{ channel_id: 5, channel_url: "https://x19.fp.ps.netease.com/icon.png", version: 2 }],
  guide_list: [{ guide_id: "guide-1", title: "现有攻略", status: "online", unknown_property: "preserve" }],
  discount: [{ begin_at: 1, discount: 80 }],
  online_time: "response-only",
  server_private_response: "do not send",
};

/** All network calls in these tests terminate at an in-memory response */
function mockFetch(respond: (url: string, init: RequestInit, index: number) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const index = calls.length;
    calls.push({ url, init });
    return respond(url, init, index);
  };
  return calls;
}
/** Match the platform envelope, including writes with no data member */
function response(data?: unknown, status = "ok") {
  return new Response(JSON.stringify({ status, ...(data === undefined ? {} : { data }) }), {
    headers: { "content-type": "application/json" },
  });
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBridge === undefined) delete hostGlobal.glaze;
  else hostGlobal.glaze = originalBridge;
  clearWorkReads();
});

/** Count renderer reads with an in-memory host; no authenticated platform is contacted */
function mockWorkHost() {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const account = { id: "a", status: "active" };
  const listeners = new Map<string, (payload: { current: typeof account | null; accounts: unknown[] }) => void>();
  hostGlobal.glaze = {
    rpc: async (method: string, params: Record<string, unknown> = {}) => {
      calls.push({ method, params });
      return {
        ok: true,
        value:
          method === "account.current"
            ? account
            : method === "works.page"
              ? { total: 0, items: [] }
              : method === "works.editor"
                ? {
                    itemId: params.itemId,
                    status: "init",
                    version: "0.1",
                    modCode: "",
                    guides: [],
                    fields: { item_name: "test" },
                  }
                : { tags: [] },
      };
    },
    on: (event: string, listener: (payload: { current: typeof account | null; accounts: unknown[] }) => void) => {
      listeners.set(event, listener);
      return () => listeners.delete(event);
    },
  };
  return {
    calls,
    emit: (current: typeof account | null) =>
      listeners.get("account.changed")?.({ current, accounts: current ? [current] : [] }),
    clearCache: () => listeners.get("cache.cleared")?.({ current: null, accounts: [] }),
  };
}

test("first-page warmup shares the visible read and never requests all works or covers", async () => {
  const host = mockWorkHost();
  await Promise.all([preloadWorksPage("a"), preloadWorksPage("a")]);
  assert.deepEqual(host.calls, [{ method: "works.page", params: { account: "a", page: 0, pageSize: 9 } }]);
  await preloadWorksPage("a");
  assert.equal(host.calls.length, 1);
});

test("next-page preparation is bounded to one page and two simultaneous cover reads", async () => {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  let active = 0;
  let maximum = 0;
  hostGlobal.glaze = {
    rpc: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === "works.page")
        return {
          ok: true,
          value: { total: 90, items: Array.from({ length: 9 }, (_, i) => ({ itemId: String(10 + i) })) },
        };
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return { ok: true, value: { itemId: params.itemId } };
    },
  };
  await preloadNextWorksPage("a", 0, 9, 90);
  assert.equal(maximum, 2);
  assert.equal(calls.length, 10);
  assert.deepEqual(calls[0], { method: "works.page", params: { account: "a", page: 1, pageSize: 9 } });
  await preloadNextWorksPage("a", 0, 9, 90);
  assert.equal(calls.length, 10);
  await preloadNextWorksPage("a", 9, 9, 90);
  await preloadNextWorksPage("a", 1, 9, 90, () => true);
  assert.equal(calls.length, 10);
});

test("cancelled or invalidated background pages never start cover batches", async () => {
  for (const invalidate of [false, true]) {
    clearWorkReads();
    let cancelled = false;
    const calls: string[] = [];
    hostGlobal.glaze = {
      rpc: async (method: string) => {
        calls.push(method);
        if (invalidate) invalidateWorks("a");
        else cancelled = true;
        return { ok: true, value: { total: 90, items: [{ itemId: "10" }] } };
      },
    };
    await preloadNextWorksPage("a", 0, 9, 90, () => cancelled);
    assert.deepEqual(calls, ["works.page"]);
  }
});

test("pending navigation preserves the displayed page until its own rows arrive", () => {
  const previous = { page: 0, data: { total: 90, items: [] } };
  assert.equal(selectWorkListView(2, null, previous), previous);
  const arrived = { total: 90, items: [] };
  assert.deepEqual(selectWorkListView(2, arrived, previous), { page: 2, data: arrived });
  assert.equal(selectWorkListView(9, { total: 5, items: [] }, previous), previous);
  assert.deepEqual(selectWorkListView(0, { total: 0, items: [] }, previous), {
    page: 0,
    data: { total: 0, items: [] },
  });
});

test("list page and scroll position are account-local and cleared with session data", () => {
  rememberWorkListPosition("a", 3, 480);
  assert.deepEqual(workListPosition("a"), { page: 3, scrollTop: 480 });
  assert.deepEqual(workListPosition("b"), { page: 0, scrollTop: 0 });
  clearWorkListPositions();
  assert.deepEqual(workListPosition("a"), { page: 0, scrollTop: 0 });
});

test("detail intent shares in-flight data and reuses dictionaries across different works", async () => {
  const host = mockWorkHost();
  await Promise.all([preloadWorkEditor("a", "1"), preloadWorkEditor("a", "1")]);
  await preloadWorkEditor("a", "2");
  assert.equal(host.calls.filter((call) => call.method === "works.editor").length, 2);
  assert.equal(host.calls.filter((call) => call.method === "works.options").length, 1);
  assert.ok(host.calls.every((call) => ["works.editor", "works.options"].includes(call.method)));
  invalidateWorks("a");
  await preloadWorkEditor("a", "1");
  assert.equal(host.calls.filter((call) => call.method === "works.editor").length, 3);
  assert.equal(host.calls.filter((call) => call.method === "works.options").length, 1);
});

test("editor and options caches stay isolated across accounts and clear on session reset", async () => {
  const host = mockWorkHost();
  await preloadWorkEditor("a", "1");
  await preloadWorkEditor("b", "1");
  assert.equal(host.calls.length, 4);
  clearWorkReads();
  await preloadWorkEditor("a", "1");
  assert.equal(host.calls.length, 6);
});

test("failed option prefetch remains retryable", async () => {
  hostGlobal.glaze = { rpc: async () => ({ ok: false, error: { kind: "network", message: "offline" } }) };
  assert.equal((await preloadWorkOptions("a")).ok, false);
  const host = mockWorkHost();
  assert.equal((await preloadWorkOptions("a")).ok, true);
  assert.equal(host.calls.length, 1);
});

test("idle first-page preparation survives routine account events but clears on logout", async () => {
  const host = mockWorkHost();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = new Map<number, () => void>();
  let next = 0;
  const schedule = (callback: () => void) => {
    timers.set(++next, callback);
    return next;
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout: schedule,
      clearTimeout: (id: number) => timers.delete(id),
      requestIdleCallback: schedule,
      cancelIdleCallback: (id: number) => timers.delete(id),
      addEventListener: () => {},
    },
  });
  const stop = startWorksWarmup();
  try {
    const boot = timers.get(1);
    timers.delete(1);
    boot?.();
    await Promise.resolve();
    assert.equal(host.calls.filter((call) => call.method === "works.page").length, 0);
    for (const [id, callback] of timers) {
      timers.delete(id);
      callback();
    }
    await preloadWorksPage("a");
    host.emit({ id: "a", status: "active" });
    await preloadWorksPage("a");
    assert.equal(host.calls.filter((call) => call.method === "works.page").length, 1);
    host.clearCache();
    await preloadWorksPage("a");
    assert.equal(host.calls.filter((call) => call.method === "works.page").length, 2);
    host.emit(null);
    assert.equal(timers.size, 0);
    host.emit({ id: "b", status: "active" });
    stop();
    for (const callback of timers.values()) callback();
    assert.equal(host.calls.filter((call) => call.method === "works.page").length, 2);
    await preloadWorksPage("a");
    assert.equal(host.calls.filter((call) => call.method === "works.page").length, 3);
  } finally {
    stop();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("scheduled works keep their platform status across list, page and editor reads", async () => {
  const row = { ...fixture, status: "appoint_online", create_time: "2026-10-01" };
  mockFetch((url) => response(url.includes("/items/categories/pe/?") ? { count: 1, item: [row] } : row));
  const page = await getWorksPage(session, 0, 9);
  const list = await listWorks(session);
  const editor = await readWorkEditor(session, itemId);
  assert.equal(page.ok && page.value.items[0]?.status, "appoint_online");
  assert.equal(list.ok && list.value[0]?.status, "appoint_online");
  assert.equal(editor.ok && editor.value.status, "appoint_online");
  assert.equal(statusLabels.appoint_online, "定时上架中");
  assert.equal(statusTones.appoint_online, "progress");
  assert.deepEqual(actionsFor("appoint_online"), ["viewFeedback", "cancelAppointOnline"]);
  assert.equal(readWorkStatus("new_unrecognized_status"), "unknown");
});

test("workbench requests only nine rows and uses the platform count for pagination", async () => {
  const calls = mockFetch(() => response({ count: 90, item: [{ ...fixture, create_time: "2026-10-01" }] }));
  const result = await getWorksPage(session, 2, 9);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.total, 90);
    assert.equal(result.value.items.length, 1);
  }
  const url = new URL(calls[0]?.url ?? "");
  assert.equal(url.searchParams.get("start"), "18");
  assert.equal(url.searchParams.get("span"), "9");
  for (const [page, size] of [
    [-1, 9],
    [0, 0],
    [0, 51],
    [1.5, 9],
  ] as const)
    assert.equal((await getWorksPage(session, page, size)).ok, false);
  assert.equal(calls.length, 1);
  mockFetch(() => response({ item: [] }));
  assert.equal((await getWorksPage(session, 0, 9)).ok, false);
});

test("work cache coalesces pending reads and returns warm data without a request", async () => {
  let now = 100;
  let calls = 0;
  const cache = new WorkQueryCache<number>(30, 2, () => now);
  const load = async () => ({ ok: true as const, value: ++calls });
  const first = cache.read('["a",0,9]', load);
  assert.equal(cache.read('["a",0,9]', load), first);
  await first;
  assert.equal(cache.peek('["a",0,9]'), 1);
  await cache.read('["a",0,9]', load);
  assert.equal(calls, 1);
  now = 131;
  assert.equal(cache.peek('["a",0,9]'), 1);
  assert.equal(cache.fresh('["a",0,9]'), false);
  await cache.read('["a",0,9]', load);
  assert.equal(calls, 2);
});

test("work cache isolates accounts and bounds recent page and cover entries", async () => {
  const cache = new WorkQueryCache<string>(1000, 2);
  await cache.read('["a",0]', async () => ({ ok: true, value: "account-a" }));
  assert.equal(cache.peek('["b",0]'), null);
  await cache.read('["b",0]', async () => ({ ok: true, value: "account-b" }));
  await cache.read('["a",1]', async () => ({ ok: true, value: "page-2" }));
  assert.equal(cache.peek('["a",0]'), null);
  cache.invalidate('["a",');
  assert.equal(cache.peek('["a",1]'), null);
  assert.equal(cache.peek('["b",0]'), "account-b");
});

test("invalidating work data prevents a late read from replacing a newer result", async () => {
  const cache = new WorkQueryCache<string>(1000, 2);
  let finish: (value: { ok: true; value: string }) => void = () => {};
  const pending = cache.read(
    "page",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  cache.invalidate();
  await cache.read("page", async () => ({ ok: true, value: "new" }));
  finish({ ok: true, value: "old" });
  await pending;
  assert.equal(cache.peek("page"), "new");
});

test("work cache keeps stale rows on failure and retries instead of caching an empty success", async () => {
  let now = 0;
  const cache = new WorkQueryCache<number>(1, 2, () => now);
  await cache.read("page", async () => ({ ok: true, value: 9 }));
  now = 2;
  const result = await cache.read("page", async () => {
    throw new Error("offline");
  });
  assert.equal(result.ok, false);
  assert.equal(cache.peek("page"), 9);
  assert.equal(cache.fresh("page"), false);
  await cache.read("page", async () => ({ ok: true, value: 10 }));
  assert.equal(cache.peek("page"), 10);
});

const createConstants = {
  pri_type: { pe: [{ id: 2, title: "add_ons" }], comp: [] },
  sub_type: { pe: { 2: [{ id: 4, title: "玩法" }] } },
  mod_second_type: { 2: [{ id: 7, title: "大型玩法" }] },
  mod_version: ["3.9"],
  label_type: { 1: [{ id: 23, title: "生存" }] },
  item_tag_limit: 3,
  channel: { pe: [{ id: 5, title: "ICON", width: 1000, height: 1000, version: 3 }] },
  price_type: [
    { id: "free", min: 0, max: 0, step: 0 },
    { id: "diamond", min: 300, max: 20000, step: 100 },
  ],
};
/** Local signed-receipt fixtures model the create schema, not update URL strings */
function newWorkFields() {
  return {
    ...emptyWorkCreateFields(),
    item_name: " 新建测试模组 ",
    pri_type: 2,
    sub_type: 4,
    mod_second_type: 7,
    mod_version: "3.9",
    res: [
      {
        res_name: "new.zip",
        res_url: { body: "{}", sign: "test-sign", file_type: "zip_package" },
        add_version: true,
        old_metadata: "strip",
      },
    ],
    channel: [{ channel_id: 5, channel_url: { body: "{}", sign: "test-sign", file_type: "image" }, version: 3 }],
  };
}

test("creation is shell-only and rejects identifiers and review flags while accepting deferred draft fields", () => {
  assert.equal(capabilities["works.create"].caller, "shell");
  assert.equal(capabilities["works.create"].mcp, undefined);
  assert.equal(isWorkCreateParams({ account: "a", fields: newWorkFields() }), true);
  for (const key of ["item_id", "is_check_apply", "unknown_field"])
    assert.equal(isWorkCreateParams({ account: "a", fields: { ...newWorkFields(), [key]: true } }), false);
  assert.equal(isWorkCreateParams({ account: "", fields: newWorkFields() }), false);
  const a = emptyWorkCreateFields();
  a.item_name = "changed";
  assert.equal(emptyWorkCreateFields().item_name, "");
});

test("create uses its own DTO and accepts a successful response without an id", async () => {
  const calls = mockFetch((url, init) =>
    init.method === "POST" ? response() : response(url.endsWith("/item-tag/") ? { tag_list: [] } : createConstants),
  );
  assert.deepEqual(await createWork(session, { account: "a", fields: newWorkFields() }), {
    ok: true,
    value: undefined,
  });
  const writes = calls.filter((call) => call.init.method === "POST");
  assert.equal(writes.length, 1);
  assert.ok(writes[0]?.url.endsWith("/items/categories/pe/upload"));
  const body = JSON.parse(String(writes[0]?.init.body));
  assert.equal(body.item_name, "新建测试模组");
  assert.equal(body.item_version, "0.1");
  assert.equal(body.is_check_apply, false);
  assert.equal(body.mod_second_type, 7);
  assert.equal(body.res[0].res_url.sign, "test-sign");
  assert.equal(body.res[0].old_metadata, undefined);
  assert.equal(body.channel[0].version, undefined);
  assert.deepEqual(body.mc_version, []);
  assert.equal(body.sync_item_info, undefined);
  body.res.push({});
  assert.equal((buildWorkCreate(newWorkFields()).res as unknown[]).length, 1);
});

test("create and save resolve detail categories by primary type with live platform ids", async () => {
  const constants = {
    ...createConstants,
    pri_type: {
      pe: [
        { id: 1, title: "地图" },
        { id: 2, title: "add_ons" },
      ],
      comp: [],
    },
    sub_type: {
      pe: {
        1: [{ id: 2, title: "角色扮演" }],
        2: [
          { id: 6, title: "玩法拓展" },
          { id: 8, title: "生物改造" },
        ],
      },
    },
    mod_second_type: { 2: [{ id: 203, title: "更多生物" }] },
  };
  const raw = { ...fixture, pri_type: 2, sub_type: 6, mod_second_type: 203 };
  const base = { pri_type: raw.pri_type, sub_type: raw.sub_type, mod_second_type: raw.mod_second_type };
  for (const [patch, accepted] of [
    [{ pri_type: 2, sub_type: 6, mod_second_type: 203 }, true],
    [{ pri_type: 2, sub_type: 8, mod_second_type: 203 }, true],
    [{ pri_type: 1, sub_type: 2, mod_second_type: 203 }, false],
    [{ pri_type: 1, sub_type: 2, mod_second_type: 0 }, true],
    [{ pri_type: 2, sub_type: 6, mod_second_type: 999 }, false],
  ] as const) {
    for (const action of ["create", "save"] as const) {
      const calls = mockFetch((url, init) => {
        if (init.method === "POST") return response();
        if (url.endsWith("/items/mc_consts/")) return response(constants);
        if (url.endsWith("/item-tag/")) return response({ tag_list: [] });
        return response(raw);
      });
      const result =
        action === "create"
          ? await createWork(session, { account: "a", fields: { ...newWorkFields(), ...patch } })
          : await saveWorkEditor(session, { itemId, base, patch });
      const message = `${action}: ${JSON.stringify(patch)}`;
      assert.equal(result.ok, accepted, message);
      const writes = calls.filter((call) => call.init.method === "POST");
      assert.equal(writes.length, accepted ? 1 : 0, message);
      if (accepted) {
        const body = JSON.parse(String(writes[0]?.init.body));
        assert.equal(body.pri_type, patch.pri_type);
        assert.equal(body.sub_type, patch.sub_type);
        assert.equal(body.mod_second_type, patch.mod_second_type);
      }
    }
  }
});

test("create validates missing resources, stale classifications and prices before POST", async () => {
  for (const patch of [
    { item_name: " " },
    { res: [] },
    { pri_type: 999 },
    { sub_type: 99 },
    { mod_second_type: 999 },
    { mod_second_type: 0 },
    { mod_version: "obsolete" },
    { label_type_list: [999] },
    { price_type: "diamond", price_rank: 1, price: 300 },
    { res: [{ res_name: "old.zip", res_url: "existing-url", add_version: true }] },
    { channel: [{ channel_id: 5, channel_url: "https://x19.fp.ps.netease.com/old.png" }] },
  ]) {
    const calls = mockFetch((url) => response(url.endsWith("/item-tag/") ? { tag_list: [] } : createConstants));
    const result = await createWork(session, { account: "a", fields: { ...newWorkFields(), ...patch } });
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.equal(calls.filter((call) => call.init.method === "POST").length, 0);
  }
});

test("creation never retries an uncertain POST or hides a platform rejection", async () => {
  for (const networkFailure of [true, false]) {
    const calls = mockFetch((url, init) => {
      if (init.method !== "POST") return response(url.endsWith("/item-tag/") ? { tag_list: [] } : createConstants);
      if (networkFailure) throw new TypeError("connection lost after sending");
      return response(undefined, "rejected");
    });
    const result = await createWork(session, { account: "a", fields: newWorkFields() });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, networkFailure ? "network" : "business");
    assert.equal(calls.filter((call) => call.init.method === "POST").length, 1);
  }
});

/** Construct tiny MP4 metadata fixtures without embedding real media files */
function videoFixture(seconds: number, width: number, height: number, codec = "avc1"): Buffer {
  const box = (name: string, data: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length + 8);
    header.write(name, 4);
    return Buffer.concat([header, data]);
  };
  const duration = Buffer.alloc(100);
  duration.writeUInt32BE(1000, 12);
  duration.writeUInt32BE(seconds * 1000, 16);
  const dimensions = Buffer.alloc(84);
  dimensions.writeUInt32BE(width * 65536, 76);
  dimensions.writeUInt32BE(height * 65536, 80);
  const description = Buffer.alloc(16);
  description.writeUInt32BE(1, 4);
  description.write(codec, 12);
  return box(
    "moov",
    Buffer.concat([
      box("mvhd", duration),
      box(
        "trak",
        Buffer.concat([box("tkhd", dimensions), box("mdia", box("minf", box("stbl", box("stsd", description))))]),
      ),
    ]),
  );
}

test("video metadata enforces duration, ratio, codec and container bounds", () => {
  assert.doesNotThrow(() => validateWorkVideo(videoFixture(90, 1920, 1080)));
  assert.throws(() => validateWorkVideo(videoFixture(91, 1920, 1080)), /时长/);
  assert.throws(() => validateWorkVideo(videoFixture(30, 1000, 1000)), /16:9/);
  assert.throws(() => validateWorkVideo(videoFixture(30, 1920, 1080, "hvc1")), /H.264/);
  const broken = videoFixture(30, 1920, 1080);
  broken.writeUInt32BE(broken.length + 1);
  assert.throws(() => validateWorkVideo(broken), /损坏/);
});

test("IPC rejects unknown fields, prototype keys and mismatched baselines", () => {
  assert.equal(isWorkSaveParams({ itemId, base: { item_name: "old" }, patch: { item_name: "new" } }), true);
  assert.equal(isWorkSaveParams({ itemId, base: {}, patch: { item_name: "new" } }), false);
  assert.equal(isWorkSaveParams({ itemId, base: { guide_list: [] }, patch: { guide_list: [] } }), false);
  assert.equal(
    isWorkSaveParams(JSON.parse(`{"itemId":"${itemId}","base":{"info":""},"patch":{"info":{"__proto__":{}}}}`)),
    false,
  );
});

test("64-bit identifiers survive response parsing without rounding", () => {
  assert.deepEqual(parsePlatformJson('{"relate_item_id":4669876470260845864,"queue_length":12}'), {
    relate_item_id: "4669876470260845864",
    queue_length: 12,
  });
});

test("partial update preserves resource metadata, guides, discount and play-plan state", () => {
  const body = buildWorkUpdate(fixture, { item_name: "新名称" });
  assert.equal(body.item_name, "新名称");
  assert.equal(body.info, fixture.info);
  assert.deepEqual(body.res, fixture.res);
  assert.deepEqual(body.guide_list, fixture.guide_list);
  assert.deepEqual(body.discount, fixture.discount);
  assert.equal(body.pe_is_add_play_plan, true);
  assert.deepEqual(body.tag, fixture.tags);
  assert.deepEqual(body.white_list, ["player-1"]);
  assert.deepEqual(body.mc_version, ["1.21"]);
  assert.equal(body.is_check_apply, false);
  assert.equal("online_time" in body, false);
  assert.equal("server_private_response" in body, false);
  assert.equal("sync_item_info" in body, false);
});

test("sparse detail responses produce complete update defaults without losing populated metadata", () => {
  const raw = {
    item_id: itemId,
    item_name: "测试作品",
    status: "init",
    item_version: "3.4",
    mc_version: "",
    subject_id: "",
    collection_id: "",
    claim_item_enabled: 0,
    corp_proof_image: null,
    requirement: null,
    multi_tags: "",
    sync_pc_flag: false,
    dlc_info: { dlc_switch: false, dlc_type: "off", master: null, slave_list: null },
    res: fixture.res,
    channel: fixture.channel,
    video_info_list: [{ url: "https://x19.fp.ps.netease.com/video.mp4", size: 100, cover: "cover" }],
    intercept_fields: ["info"],
  };
  const body = buildWorkUpdate(raw, { item_name: "测试作品123" });
  assert.equal(body.item_name, "测试作品123");
  for (const key of ["online_platform", "requirement", "prerequisite_item_ids", "silent_white_list", "guide_list"])
    assert.deepEqual(body[key], [], key);
  assert.equal(body.mod_id, 0);
  assert.equal(body.java_version, "");
  assert.equal(body.current_change_log, "");
  assert.equal(body.is_asymmetric, false);
  assert.equal(body.claim_item_enabled, false);
  assert.equal(body.is_check_apply, false);
  assert.equal(body.multi_tags, "0");
  assert.equal(body.collection_id, "0");
  assert.equal(body.subject_id, null);
  assert.deepEqual(body.dlc_info, { dlc_switch: false, dlc_type: "off", master: {}, slave_list: [] });
  for (const key of ["res", "channel", "video_info_list"] as const) assert.deepEqual(body[key], raw[key]);
  for (const key of ["corp_proof_image", "sync_item_info", "intercept_fields", "status"])
    assert.equal(key in body, false, key);
  (body.online_platform as unknown[]).push("test");
  assert.deepEqual(buildWorkUpdate(raw, {}).online_platform, []);
});

test("save uses the latest server snapshot and writes a numeric long id exactly once", async () => {
  const calls = mockFetch((_url, _init, index) =>
    index === 0 ? response({ ...fixture, activity_desc: "最新活动说明" }) : response(),
  );
  const result = await saveWorkEditor(session, {
    itemId,
    base: { item_name: fixture.item_name },
    patch: { item_name: "修改名称" },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.init.method, "POST");
  assert.match(calls[1]?.url ?? "", /\/update$/);
  assert.match(String(calls[1]?.init.body), /"relate_item_id":4669876470260845864/);
  assert.equal(JSON.parse(String(calls[1]?.init.body)).activity_desc, "最新活动说明");
  assert.equal(calls[1]?.init.redirect, "manual");
});

test("concurrent edits and read-only statuses prevent any POST", async () => {
  const calls = mockFetch(() => response({ ...fixture, item_name: "在其他客户端修改" }));
  const result = await saveWorkEditor(session, {
    itemId,
    base: { item_name: fixture.item_name },
    patch: { item_name: "不能覆盖" },
  });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1);
  if (!result.ok) assert.equal(result.error.kind === "business" && result.error.code, "conflict");
  const lockedCalls = mockFetch(() => response({ ...fixture, status: "reviewing" }));
  const locked = await saveWorkEditor(session, { itemId, base: { info: fixture.info }, patch: { info: "修改" } });
  assert.equal(locked.ok, false);
  assert.equal(lockedCalls.length, 1);
});

test("preserved image URLs and signed upload receipts use distinct wire shapes", () => {
  const receipt = { body: '{"url":"https://x19.fp.ps.netease.com/new.png"}', file_type: "image", sign: "test-sign" };
  const channel = [{ channel_id: 5, channel_url: receipt, version: 3 }];
  assert.equal(validateWorkPatch({ channel }, workEditorFields(fixture)), null);
  assert.deepEqual(buildWorkUpdate(fixture, { channel }).channel, channel);
  assert.equal(
    validateWorkPatch({ channel: [{ channel_id: 5, channel_url: { body: "{}" } }] }, {}),
    "图片位或上传回执无效",
  );
});

test("price types, tiers, field types and text limits are validated before mutation", () => {
  assert.ok(validateWorkPatch({ price_type: "diamond" }, workEditorFields(fixture)));
  assert.ok(validateWorkPatch({ price: 10 }, workEditorFields(fixture)));
  assert.ok(validateWorkPatch({ price: 301, price_rank: 0 }, { price_type: "diamond" }));
  assert.equal(validateWorkPatch({ price: 600, price_rank: 1 }, { price_type: "diamond" }), null);
  assert.ok(validateWorkPatch({ sync_pc_flag: "true" }, {}));
  assert.ok(validateWorkPatch({ update_summary: "字".repeat(201) }, {}));
  assert.ok(validateWorkPatch({ info: `<p>${"字".repeat(1001)}</p>` }, {}));
  assert.equal(validateWorkPatch({ info: `<p>${"&amp;".repeat(1000)}</p>` }, {}), null);
});

test("runtime dictionaries preserve ids, category parents and current image versions", async () => {
  mockFetch((url) =>
    url.endsWith("/item-tag/")
      ? response({ tag_list: ["魔法"] })
      : response({
          pri_type: { pe: [{ id: 2, title: "add_ons" }], comp: [] },
          sub_type: { pe: { 2: [{ id: 4, title: "玩法" }] } },
          mod_second_type: { 2: [{ id: 7, title: "大型玩法" }] },
          mod_version: ["3.9"],
          label_type: { 1: [{ id: 23, title: "生存" }] },
          channel: {
            pe: [{ id: 5, width: 1000, height: 1000, title: "组件ICON", version: 3 }],
            pe_multi: [],
            comp: [],
          },
        }),
  );
  const result = await getWorkEditorOptions(session);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.peSubTypes["2"]?.[0]?.id, 4);
    assert.equal(result.value.secondTypes["2"]?.[0]?.id, 7);
    assert.equal(result.value.secondTypes["4"], undefined);
    assert.equal(result.value.peImages[0]?.version, 3);
    assert.deepEqual(result.value.tags, ["魔法"]);
  }
});

test("review is separate from saving and does not hide need_check_apply", async () => {
  const calls = mockFetch((_url, _init, index) =>
    index === 0 ? response(fixture) : response({ need_check_apply: true, queue_length: 7 }),
  );
  const result = await submitWorkReview(session, itemId);
  assert.deepEqual(result, { ok: true, value: { needCheckApply: true, queueLength: 7 } });
  assert.equal(calls[1]?.init.method, "PUT");
  assert.equal(JSON.parse(String(calls[1]?.init.body)).is_check_apply, false);
});

test("upload policy blocks off-service, credential-bearing and insecure destinations", () => {
  const token = (url: string) => `Policy signature:${btoa(JSON.stringify({ url }))}`;
  assert.equal(
    resolveWorkUploadUrl(token("https://fp.ps.netease.com/x19/file/new/")),
    "https://fp.ps.netease.com/x19/file/new/",
  );
  assert.equal(
    resolveWorkUploadUrl(token("https://x19.pfp.ps.netease.com/x19/file/new/")),
    "https://x19.pfp.ps.netease.com/x19/file/new/",
  );
  for (const url of [
    "https://evil.example/upload",
    "http://x19.fp.ps.netease.com/x19/file/new/",
    "https://user:password@x19.fp.ps.netease.com/x19/file/new/",
  ])
    assert.throws(() => resolveWorkUploadUrl(token(url)));
  assert.equal(parseWorkUploadReply("<textarea>{}</textarea>", null, "image", "test.png", 2), null);
});

test("upload follows the issued policy and never forwards account cookies to FP", async () => {
  const token = `Policy signature:${btoa(JSON.stringify({ url: "https://x19.pfp.ps.netease.com/x19/file/new/" }))}`;
  const calls = mockFetch((_url, _init, index) =>
    index === 0
      ? response({ token })
      : new Response('<textarea>{"url":"https://x19.pfp.ps.netease.com/package.zip"}</textarea>', {
          headers: { "x-ntes-signature": "signed-receipt" },
        }),
  );
  const result = await uploadWorkFile(
    session,
    new Blob(["test"], { type: "application/zip" }),
    "test.zip",
    "zip_package",
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0]?.url ?? "", /file_type=zip_package/);
  assert.equal(new Headers(calls[1]?.init.headers).has("Cookie"), false);
  const form = calls[1]?.init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("Authorization"), token);
  if (result.ok) assert.equal(result.value.receipt.sign, "signed-receipt");
});

test("empty write payloads succeed, expired sessions and HTTP errors never look successful", async () => {
  mockFetch(() => response());
  assert.equal((await writeMcDevData("test", "/test", session, "POST", "{}")).ok, true);
  assert.equal((await getMcDevData("test", "/test", session)).ok, false);
  mockFetch(() => response({}, "no_login"));
  assert.deepEqual(await readWorkEditor(session, itemId), { ok: false, error: { kind: "session_expired" } });
  mockFetch(() => new Response('{"status":"ok","data":{}}', { status: 500 }));
  assert.equal((await writeMcDevData("test", "/test", session, "POST", "{}")).ok, false);
});

test("GET follows one same-origin trailing slash normalization with the same query", async () => {
  const calls = mockFetch((_url, _init, index) =>
    index === 0
      ? new Response(null, { status: 308, headers: { location: "/items/mc_consts/?platform=pe" } })
      : response({ loaded: true }),
  );
  const result = await getMcDevData("items.mc_consts", "/items/mc_consts?platform=pe", session);
  assert.deepEqual(result, { ok: true, value: { loaded: true } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.url, "https://mc-launcher.webapp.163.com/items/mc_consts/?platform=pe");
  assert.equal(calls[1]?.init.redirect, "manual");
});

test("foreign hosts, changed queries and redirect loops are not mistaken for offline connections", async () => {
  for (const location of [
    "https://evil.example/item-tag/",
    "/item-tag/?changed=true",
    "/login/",
    "https://user:password@mc-launcher.webapp.163.com/item-tag/",
  ]) {
    const calls = mockFetch(() => new Response(null, { status: 308, headers: { location } }));
    const result = await getMcDevData("item-tag", "/item-tag", session);
    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "business");
  }
  const calls = mockFetch(() => new Response(null, { status: 308, headers: { location: "/item-tag/" } }));
  const result = await getMcDevData("item-tag", "/item-tag", session);
  assert.equal(calls.length, 2);
  assert.equal(result.ok, false);
});

test("POST and PUT redirects never replay a write or mark the account offline", async () => {
  for (const method of ["POST", "PUT"] as const) {
    const calls = mockFetch(() => new Response(null, { status: 308, headers: { location: "/test/" } }));
    const result = await writeMcDevData("test", "/test", session, method, "{}");
    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "business");
  }
});
