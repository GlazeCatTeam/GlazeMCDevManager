import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/work-editor-features-ui`;
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 0, hmr: false },
  resolve: {
    alias: {
      "react-dom": fileURLToPath(new URL("../apps/desktop/node_modules/react-dom", import.meta.url)),
      react: fileURLToPath(new URL("../apps/desktop/node_modules/react", import.meta.url)),
    },
  },
});
let browser, page;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.argv[3] ?? "msedge" });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.protocol === "blob:") return route.continue();
    if (["http:", "https:"].includes(url.protocol)) external.push(url.href);
    return route.abort();
  });
  const url = `${server.resolvedUrls.local[0]}tests/fixtures/work-editor.html?editorFeatures=1`;
  const unlock = async () => {
    const button = page.locator('button[aria-label^="更新"]').first();
    if (await button.count()) await button.click();
  };
  const tab = async (name) => {
    await page.getByRole("tab", { name, exact: true }).click();
    await unlock();
  };
  const radio = (group, answer) =>
    page.getByRole("group", { name: group, exact: true }).getByRole("radio", { name: answer, exact: true }).check();
  const calls = (method) =>
    page.evaluate((method) => workEditorFixture.requests.filter((r) => r.method === method), method);
  /** Save the active section and inspect the actual mock RPC payload */
  const save = async () => {
    const before = (await calls("works.save")).length;
    await page.getByRole("button", { name: "保存此分区", exact: true }).first().click();
    await page.waitForFunction(
      (before) => workEditorFixture.requests.filter((r) => r.method === "works.save").length > before,
      before,
    );
    await page.getByText("此分区已保存到网易", { exact: true }).waitFor();
    return (await calls("works.save")).at(-1).params.patch;
  };
  await page.goto(url);
  await page.getByRole("button", { name: "查看 猫咖啡测试专用 详情" }).click();
  await page.getByRole("tab", { name: "基本信息" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).isDisabled(), true);
  await page.screenshot({ path: `${output}/readonly.png`, fullPage: true });
  await unlock();
  assert.equal((await calls("works.save")).length, 0);
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).isDisabled(), false);
  const tagInput = page.getByRole("combobox", { name: "搜索或输入模组标签" });
  const tagSuggestions = page.getByRole("listbox", { name: "模组标签建议" });
  await tagInput.focus();
  assert.equal(await tagSuggestions.count(), 0);
  await tagInput.fill("测试标签");
  await tagSuggestions.waitFor();
  assert.equal(await tagSuggestions.getByRole("option").count(), 20);
  const tagBounds = await tagSuggestions.boundingBox();
  const inputBounds = await tagInput.boundingBox();
  assert.ok(tagBounds.height <= 240 && Math.abs(tagBounds.width - inputBounds.width) < 2);
  await tagInput.press("ArrowUp");
  await page.waitForFunction(() => document.querySelector('[role="listbox"]').scrollTop > 0);
  assert.equal(await tagSuggestions.count(), 1);
  await tagInput.press("ArrowDown");
  await page.screenshot({ path: `${output}/tag-suggestions.png`, fullPage: true });
  await tagInput.press("Escape");
  assert.equal(await tagSuggestions.count(), 0);
  await tagInput.fill("魔");
  await tagInput.press("ArrowDown");
  await tagInput.press("ArrowDown");
  await tagInput.press("Enter");
  assert.equal(await tagInput.inputValue(), "剑与魔法");
  assert.equal(await tagSuggestions.count(), 0);
  await tagInput.press("Enter");
  await page.getByRole("button", { name: "移除标签 剑与魔法", exact: true }).click();
  await tagInput.fill("测试标签");
  await tagSuggestions.getByRole("option", { name: "测试标签1", exact: true }).click();
  assert.equal(await tagInput.inputValue(), "测试标签1");
  assert.equal(await tagSuggestions.count(), 0);
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("button", { name: "移除标签 测试标签1", exact: true }).click();
  await tagInput.fill("输入法自定义标签");
  await tagInput.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  assert.equal(await page.getByRole("button", { name: "移除标签 输入法自定义标签", exact: true }).count(), 0);
  await tagInput.press("Enter");
  await page.getByRole("button", { name: "移除标签 输入法自定义标签", exact: true }).click();
  await tagInput.fill("魔");
  await page.getByRole("textbox", { name: "资源名称 *" }).click();
  assert.equal(await tagSuggestions.count(), 0);
  await tagInput.focus();
  await tagSuggestions.waitFor();
  await page.getByRole("textbox", { name: "资源名称 *" }).hover();
  await page.mouse.wheel(0, 120);
  await tagSuggestions.waitFor({ state: "detached" });
  await tagInput.fill("魔");
  await page.setViewportSize({ width: 1000, height: 850 });
  await tagSuggestions.waitFor({ state: "detached" });
  await tagInput.fill("测试标签");
  await tagSuggestions.waitFor();
  const narrowTagBounds = await tagSuggestions.boundingBox();
  assert.ok(narrowTagBounds.y >= 40 && narrowTagBounds.y + narrowTagBounds.height <= 850);
  await page.screenshot({ path: `${output}/tag-suggestions-narrow.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await tagSuggestions.waitFor({ state: "detached" });
  await tagInput.fill("魔");
  await page.getByRole("tab", { name: "资源文件", exact: true }).click();
  assert.equal(await tagSuggestions.count(), 0);
  await tab("基本信息");
  assert.equal(await tagSuggestions.count(), 0);
  await page.getByRole("textbox", { name: "资源名称 *" }).fill("编辑模式测试");
  await page.evaluate(() => workEditorFixture.failSave(true));
  await page.getByRole("button", { name: "保存此分区", exact: true }).click();
  await page.getByText("模拟保存失败，草稿保留").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).isDisabled(), false);
  await page.evaluate(() => workEditorFixture.failSave(false));
  await save();
  assert.equal(await tagInput.isDisabled(), true);
  assert.equal(await tagSuggestions.count(), 0);
  await page.getByRole("button", { name: "更新基本信息", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).isDisabled(), true);
  await unlock();
  await page.getByRole("textbox", { name: "资源名称 *" }).fill("跨分区草稿");
  await page.getByRole("tab", { name: "资源定价", exact: true }).click();
  assert.equal(await page.getByRole("combobox", { name: "钻石价格档位" }).isDisabled(), true);
  await unlock();
  await page.getByRole("combobox", { name: "钻石价格档位" }).selectOption("2");
  await save();
  await page.getByRole("tab", { name: "基本信息", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).inputValue(), "跨分区草稿");
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).isDisabled(), false);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: "更新基本信息", exact: true }).waitFor();
  await page.getByRole("tab", { name: "详情与攻略", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "作品详情内容" }).getAttribute("contenteditable"), "false");
  await unlock();
  assert.equal(await page.getByRole("textbox", { name: "作品详情内容" }).getAttribute("contenteditable"), "true");
  await page.getByRole("tab", { name: "图片与视频", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "替换组件 ICON" }).isDisabled(), true);
  await page.getByRole("button", { name: "更新PE 图片", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "替换组件 ICON" }).isDisabled(), false);
  assert.equal(await page.getByRole("button", { name: "选择 / 替换", exact: true }).isDisabled(), true);
  await page.getByRole("tab", { name: "更新与上架", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "本次更新内容" }).isDisabled(), true);
  await page.getByRole("button", { name: "更新PE 更新纪要", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "本次更新内容" }).isDisabled(), false);
  assert.equal(
    await page.getByRole("group", { name: "是否弱下架" }).getByRole("radio", { name: "是", exact: true }).isDisabled(),
    true,
  );
  await tab("基本信息");
  await radio("原创作品 *", "否");
  await page.getByRole("button", { name: "选择 / 替换授权证明" }).click();
  await page.getByRole("dialog", { name: "裁剪作品图片" }).waitFor();
  await page.getByRole("img", { name: "待裁剪图片" }).evaluate((img) => img.decode());
  const cropBounds = await page.getByRole("img", { name: "待裁剪图片" }).boundingBox();
  assert.ok(cropBounds.width > 100 && cropBounds.height > 50);
  await page.screenshot({ path: `${output}/crop.png`, fullPage: true });
  await page.getByRole("button", { name: "取消裁剪" }).click();
  assert.equal((await calls("works.uploadCroppedImage")).length, 0);
  await page.getByRole("button", { name: "选择 / 替换授权证明" }).click();
  const cropArea = page.getByRole("button", { name: /^图片裁剪区域/ });
  const selection = cropArea.locator("[data-crop-selection]");
  assert.equal(await page.getByRole("slider").count(), 0);
  const initial = await selection.boundingBox();
  const scrollBefore = await page.evaluate(() => [...document.querySelectorAll("*")].map((e) => e.scrollTop));
  await cropArea.hover();
  await page.mouse.wheel(0, -350);
  await page.waitForFunction(() => document.querySelector("[data-crop-selection]").getBoundingClientRect().width < 120);
  const scaled = await selection.boundingBox();
  assert.ok(scaled.width < initial.width && scaled.height < initial.height);
  assert.deepEqual(
    await page.evaluate(() => [...document.querySelectorAll("*")].map((e) => e.scrollTop)),
    scrollBefore,
  );
  await page.mouse.move(scaled.x + scaled.width / 2, scaled.y + scaled.height / 2);
  await page.mouse.down();
  await page.mouse.move(scaled.x + scaled.width / 2 + 20, scaled.y + scaled.height / 2 + 15, { steps: 5 });
  await page.mouse.up();
  const moved = await selection.boundingBox();
  assert.ok(moved.x > scaled.x + 15 && moved.y > scaled.y + 10);
  const area = await cropArea.boundingBox();
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width + 90, area.y + area.height + 60, { steps: 5 });
  await page.mouse.up();
  const edge = await selection.boundingBox();
  assert.ok(Math.abs(edge.x + edge.width - area.x - area.width) < 2);
  assert.ok(Math.abs(edge.y + edge.height - area.y - area.height) < 2);
  assert.equal(await cropArea.getAttribute("data-dragging"), "false");
  await cropArea.focus();
  await page.keyboard.press("ArrowLeft");
  assert.ok((await selection.boundingBox()).x < edge.x);
  await cropArea.hover();
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -500);
  await page.waitForFunction(() => parseFloat(document.querySelector("[data-crop-selection]").style.width) === 6);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => parseFloat(document.querySelector("[data-crop-selection]").style.width) === 50);
  await page.mouse.wheel(0, -350);
  await page.waitForFunction(() => parseFloat(document.querySelector("[data-crop-selection]").style.width) < 50);
  const expectedCrop = await selection.evaluate((node) => ({
    x: Math.round(parseFloat(node.style.left) * 2),
    y: Math.round(parseFloat(node.style.top)),
    width: Math.round(parseFloat(node.style.width) * 2),
    height: Math.round(parseFloat(node.style.height)),
  }));
  await page.screenshot({ path: `${output}/crop-pointer.png`, fullPage: true });
  await page.getByRole("button", { name: "确认裁剪并上传" }).click();
  await page.getByText("文件已上传，请保存对应分区以应用到作品").waitFor();
  assert.deepEqual((await calls("works.uploadCroppedImage")).at(-1).params.crop, expectedCrop);
  assert.equal((await save()).corp_proof_image, "https://x19.fp.ps.netease.com/cropped.png");
  await tab("资源定价");
  await page.getByRole("button", { name: "添加折扣" }).click();
  await page.getByRole("spinbutton", { name: "折扣 1 比例" }).fill("80");
  const discount = (await save()).discount;
  assert.equal(discount[0].discount, 80);
  assert.ok(discount[0].end_at > discount[0].begin_at);
  await unlock();
  await page.getByRole("button", { name: "移除折扣 1" }).click();
  assert.deepEqual((await save()).discount, []);
  await tab("资源文件");
  await page.getByRole("textbox", { name: "搜索PE 前置模组" }).fill("前置");
  await page.getByRole("button", { name: "选择", exact: true }).first().click();
  await radio("加入模组畅玩计划", "是");
  const resourcePatch = await save();
  assert.equal(resourcePatch.prerequisite_items[0].item_id, "8000000000000000001");
  assert.equal(resourcePatch.pe_is_add_play_plan, true);
  const dropTarget = page.getByRole("group", { name: "资源文件上传" });
  /** Drop browser Files into the isolated host stub, without any disk or platform writes */
  const dropResource = async (names) => {
    const transfer = await page.evaluateHandle((names) => {
      const data = new DataTransfer();
      for (const name of names) data.items.add(new File(["fixture"], name));
      return data;
    }, names);
    await dropTarget.dispatchEvent("drop", { dataTransfer: transfer });
    await transfer.dispose();
  };
  await dropResource(["locked.mcpack"]);
  assert.equal((await calls("works.uploadDroppedResource")).length, 0);
  await unlock();
  await dropResource(["a.mcpack", "b.mcpack"]);
  await page.getByText("每次请拖入一个资源文件").waitFor();
  await dropResource(["wrong.png"]);
  await page.getByText("文件格式与所选资源类别不匹配").waitFor();
  assert.equal((await calls("works.uploadDroppedResource")).length, 0);
  await dropResource(["dragged.mcpack"]);
  await page.getByText("dragged.mcpack", { exact: true }).waitFor();
  assert.equal((await calls("works.uploadDroppedResource"))[0].params.resourceType, 2);
  assert.equal((await save()).res[0].res_name, "dragged.mcpack");
  await unlock();
  await page.getByRole("button", { name: "上传 / 替换", exact: true }).click();
  await page.getByText("new-mod.zip", { exact: true }).waitFor();
  assert.equal((await calls("works.upload")).at(-1).params.resourceType, 2);
  await dropTarget.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/resource-drop.png`, fullPage: true });
  await page.getByRole("combobox", { name: "资源类别 *", exact: true }).selectOption("6");
  await page.getByRole("checkbox", { name: "竞技模式", exact: true }).check();
  await radio("非对称对抗", "是");
  await page.getByRole("textbox", { name: "阵营 1" }).fill("猎人");
  await page.getByRole("textbox", { name: "阵营 2" }).fill("逃生者");
  await page.getByRole("spinbutton", { name: "游戏开始人数" }).fill("2");
  await page.getByRole("spinbutton", { name: "逃跑时间（分钟）" }).fill("5");
  await page.screenshot({ path: `${output}/lobby.png`, fullPage: true });
  const lobby = await save();
  assert.equal(lobby.is_lobby_competitive, true);
  assert.deepEqual(lobby.lobby_camps, ["猎人", "逃生者"]);
  await tab("基本信息");
  await radio("同步生成 PC 模组", "是");
  await tab("PC 同步");
  assert.equal(await page.getByRole("combobox", { name: "PC 资源类别", exact: true }).inputValue(), "9");
  await page.getByRole("button", { name: "同步 PE 详情", exact: true }).click();
  assert.match(await page.getByRole("textbox", { name: "作品详情内容" }).innerText(), /探索新的魔法材料/);
  await page.getByRole("textbox", { name: "搜索PC 前置模组" }).fill("PC");
  await page.getByRole("button", { name: "选择", exact: true }).first().click();
  await page.getByRole("button", { name: "选择", exact: true }).click();
  const pc = await save();
  assert.equal(pc.sync_item_info.requirement.length, 2);
  assert.equal(pc.sync_item_info.requirement[0].item_id, "9000000000000000001");
  assert.equal("id" in pc.sync_item_info.requirement[0], false);
  assert.match(pc.sync_item_info.info, /探索新的魔法材料/);
  await page.screenshot({ path: `${output}/pc.png`, fullPage: true });
  await tab("基本信息");
  await radio("是否为关联模组", "是");
  await page.getByRole("textbox", { name: "搜索关联模组" }).fill("失败");
  await page.getByText("模拟搜索失败").waitFor();
  await page.getByRole("textbox", { name: "搜索关联模组" }).fill("主包");
  await page.getByRole("button", { name: "选择", exact: true }).first().click();
  assert.equal((await save()).relate_item_id, "8000000000000000001");
  await unlock();
  await page.getByRole("textbox", { name: "资源名称 *" }).fill("恢复未保存草稿");
  await page.getByRole("button", { name: "首页", exact: true }).click();
  await page.getByRole("button", { name: "作品管理", exact: true }).click();
  await page
    .getByRole("button", { name: /^查看 .* 详情$/ })
    .first()
    .click();
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).inputValue(), "恢复未保存草稿");
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "保存", exact: true }).isDisabled(), true);
  await unlock();
  await save();
  await page.evaluate(() => {
    workEditorFixture.documents.values().next().value.status = "reviewing";
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByText("当前状态只允许查看，审核结束或撤销审核后才能修改。").waitFor();
  assert.equal(await page.getByRole("button", { name: "更新基本信息", exact: true }).isDisabled(), true);

  // Creation retains pending PC/link config and requires an explicit work selection.
  await page.goto(url);
  await page.getByRole("button", { name: "新增作品", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "资源名称 *" }).isDisabled(), false);
  await page.getByRole("textbox", { name: "资源名称 *" }).fill("配置齐全的新作品");
  await radio("同步生成 PC 模组", "是");
  await radio("是否为关联模组", "是");
  await page.getByRole("textbox", { name: "搜索关联模组" }).fill("主包");
  await page.getByRole("button", { name: "选择", exact: true }).first().click();
  await tab("资源文件");
  await page.getByRole("combobox", { name: "资源类别 *", exact: true }).selectOption("2");
  await page.getByRole("combobox", { name: "具体类别", exact: true }).selectOption("6");
  await page.getByRole("combobox", { name: "次级分类", exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: "modAPI 版本", exact: true }).selectOption("3.9");
  await page.getByRole("button", { name: "上传 / 替换", exact: true }).click();
  await page.getByText("文件已上传，创建作品时会一并保存").waitFor();
  await page.getByRole("button", { name: "创建作品", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认创建", exact: true }).click();
  await page.getByText("作品已创建：应用剩余配置", { exact: true }).waitFor();
  assert.equal((await calls("works.create")).length, 1);
  assert.equal((await calls("works.create"))[0].params.fields.sub_type, 6);
  assert.equal((await calls("works.create"))[0].params.fields.mod_second_type, 1);
  assert.equal((await calls("works.save")).length, 0);
  await page.getByRole("button", { name: "‹ 返回作品列表（保留配置）" }).click();
  await page.getByRole("button", { name: "新增作品", exact: true }).click();
  await page.getByText("作品已创建：应用剩余配置", { exact: true }).waitFor();
  assert.equal((await calls("works.create")).length, 1);
  await page.getByRole("combobox", { name: "选择刚创建的作品" }).selectOption("2001");
  await page.getByRole("button", { name: "应用配置", exact: true }).click();
  await page.getByRole("button", { name: "确认应用", exact: true }).click();
  await page.getByRole("button", { name: "新增作品", exact: true }).waitFor();
  assert.equal((await calls("works.save")).at(-1).params.itemId, "2001");
  assert.equal((await calls("works.submitReview")).length, 0);

  await page.goto(url);
  await page.getByRole("button", { name: "新增作品", exact: true }).click();
  await tab("资源文件");
  await page.getByRole("combobox", { name: "资源类别 *", exact: true }).selectOption("9");
  assert.equal(await page.getByRole("tab", { name: "资源定价", exact: true }).count(), 0);
  assert.equal(await page.getByRole("tab", { name: "图片与视频", exact: true }).count(), 0);
  assert.equal(await page.getByRole("textbox", { name: "搜索PE 前置模组" }).count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: bounded tag suggestions, keyboard/mouse selection, IME and custom tags, blur/Esc/scroll/resize/tab/save dismissal; default read-only, section unlock/save/relock, failed-save draft retention, restored draft locks, review-state refresh; editor features and staged creation; no external network",
  );
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
