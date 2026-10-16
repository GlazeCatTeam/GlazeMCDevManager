import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const bannerOnly = process.argv.includes("--banner-only");
const activityOnly = process.argv.includes("--activity-only");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/promotion-tests`;
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
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/glaze-image:/**", (route) => route.abort());
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/promotion.html`);
  await page.getByRole("radio").first().waitFor();
  if (!bannerOnly) {
    const nav = await page.getByRole("navigation").getByRole("button").allTextContents();
    assert.equal(nav.indexOf("活动推广"), nav.indexOf("收益管理") + 1);
    assert.equal(await page.getByRole("button", { name: "填写申请", exact: true }).isEnabled(), false);
    const heights = await page
      .locator("main section")
      .evaluateAll((panels) => panels.map((panel) => Math.round(panel.getBoundingClientRect().height)));
    assert.deepEqual(heights, [680, 680]);
    await page.screenshot({ path: `${output}/activities-dark.png` });
    await page.getByRole("radio").first().check();
    assert.equal(await page.getByRole("textbox", { name: "作品介绍", exact: true }).count(), 0);
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    await page.getByRole("dialog", { name: "添加申请", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "确认提交", exact: true }).isEnabled(), false);
    assert.equal(await page.getByRole("button", { name: /^上传宣传图片/ }).count(), 3);
    assert.equal(await page.getByRole("button", { name: "上传宣传视频", exact: true }).count(), 1);
    await page.getByRole("textbox", { name: "作品介绍", exact: true }).fill("   ");
    assert.equal(await page.getByRole("button", { name: "确认提交", exact: true }).isEnabled(), false);
    await page.getByRole("textbox", { name: "作品介绍", exact: true }).fill("全新的浮空岛探索体验");
    await page.getByRole("button", { name: "链接", exact: true }).click();
    await page.getByRole("dialog", { name: "插入链接", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "插入链接", exact: true }).count(), 0);
    assert.equal(await page.getByRole("dialog", { name: "添加申请", exact: true }).count(), 1);
    await page.getByRole("button", { name: "确认提交", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .getByRole("button", { name: "关闭申请", exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog", { name: "添加申请", exact: true }).count(), 0);
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "作品介绍", exact: true }).innerText(),
      "全新的浮空岛探索体验",
    );
    await page.getByRole("button", { name: "关闭申请", exact: true }).click();
    await page.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "作品介绍", exact: true }).innerText(), "");
    await page.getByRole("button", { name: "关闭申请", exact: true }).click();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    await page.getByRole("textbox", { name: "作品介绍", exact: true }).fill("全新的浮空岛探索体验");
    await page.getByRole("textbox", { name: "作品介绍", exact: true }).click();
    await page.getByRole("textbox", { name: "作品介绍", exact: true }).press("ControlOrMeta+a");
    await page.getByRole("button", { name: "加粗", exact: true }).click();
    assert.match(
      await page.getByRole("textbox", { name: "作品介绍", exact: true }).innerHTML(),
      /<b>|<strong>|font-weight/,
    );
    await page
      .getByRole("group", { name: "富文本格式", exact: true })
      .evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `${output}/activity-introduction-dark.png` });
    await page.setViewportSize({ width: 600, height: 720 });
    assert.equal(
      await page
        .getByRole("button", { name: "确认提交", exact: true })
        .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
      true,
    );
    assert.equal(
      await page
        .getByRole("dialog", { name: "添加申请", exact: true })
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
      true,
    );
    await page.screenshot({ path: `${output}/activity-application-narrow.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "上传宣传图片 3", exact: true }).click();
    await page.getByRole("button", { name: "替换宣传图片 3", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "上传宣传图片 1", exact: true }).count(), 1);
    await page.getByRole("button", { name: "替换宣传图片 3", exact: true }).click();
    await page.getByRole("button", { name: "移除宣传图片 3", exact: true }).click();
    await page.getByRole("button", { name: "上传宣传图片 1", exact: true }).click();
    await page.getByRole("button", { name: "上传宣传图片 2", exact: true }).click();
    await page.getByRole("button", { name: "上传宣传图片 3", exact: true }).click();
    await page.getByRole("button", { name: "上传宣传视频", exact: true }).click();
    await page.getByRole("button", { name: "替换宣传视频", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /^上传宣传图片/ }).count(), 0);
    await page.getByText("用于宣传的图片", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/activity-materials-dark.png` });
    await page.getByRole("dialog").getByText("图片 3 张 · 视频 1 个", { exact: true }).waitFor();
    assert.match(await page.getByRole("dialog").innerHTML(), /<b>|<strong>|font-weight/);
    assert.equal(await page.locator("#writes").textContent(), "0");
    await page.getByRole("dialog").getByRole("button", { name: "返回", exact: true }).click();
    assert.equal(await page.locator("#writes").textContent(), "0");
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "确认提交" }).click();
    await page.getByText("操作成功，正在更新报名记录").waitFor();
    await page.getByRole("button", { name: "刷新作品", exact: true }).waitFor();
    assert.equal(await page.locator("#writes").textContent(), "1");
    await page.getByRole("button", { name: "冒险地图", exact: true }).click();
    await page.getByText("暂无可报名作品", { exact: true }).waitFor();
    await page.getByRole("checkbox", { name: "平台返回活动结束" }).check();
    await page.getByRole("button", { name: "刷新作品", exact: true }).click();
    await page.getByText("活动已结束", { exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "作品介绍", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "填写申请", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "重试", exact: true }).count(), 0);
    await page.getByRole("checkbox", { name: "平台返回活动结束" }).uncheck();
    const moduleReads = await page.locator("#module-reads").textContent();
    await page.getByRole("button", { name: "下一页", exact: false }).click();
    await page.getByText("往期创作活动").first().waitFor();
    await page.getByText("活动已结束", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "填写申请", exact: true }).count(), 0);
    assert.equal(await page.getByRole("textbox", { name: "作品介绍", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "上传图片", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "重试", exact: true }).count(), 0);
    assert.equal(await page.locator("#module-reads").textContent(), moduleReads);
    await page.screenshot({ path: `${output}/activity-ended-dark.png` });
    await page.getByRole("button", { name: "折扣特卖", exact: true }).click();
    const firstWork = page.getByRole("checkbox", { name: /风起之岛/ });
    await firstWork.check();
    await page.getByLabel("折扣比例（%）").fill("99");
    assert.equal(await page.getByRole("button", { name: "报名特卖", exact: true }).isEnabled(), false);
    await page.getByLabel("折扣比例（%）").fill("60");
    await page.getByRole("button", { name: "报名特卖", exact: true }).click();
    await page.getByRole("dialog").getByText("折扣比例：60%", { exact: false }).waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "确认提交" }).click();
    await page.getByRole("button", { name: "取消参与", exact: true }).waitFor();
    await page.screenshot({ path: `${output}/discount-dark.png` });
    await page.getByRole("button", { name: "取消参与", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "确认提交" }).click();
    await page.getByText("暂无已报名作品", { exact: true }).waitFor();
    assert.equal(await page.locator("#writes").textContent(), "3");
  }
  if (!activityOnly) {
    const initialBannerWrites = Number(await page.locator("#writes").textContent());
    await page.getByRole("button", { name: "PE 轮播图申请", exact: true }).click();
    await page.getByRole("radio", { name: /风起之岛/ }).waitFor();
    await page.setViewportSize({ width: 1280, height: 800 });
    assert.equal(await page.getByRole("button", { name: "下一步：准备宣传内容" }).isEnabled(), false);
    await page.getByLabel("搜索推广作品").fill("10001");
    await page.getByRole("radio", { name: /风起之岛/ }).check();
    await page.getByRole("radiogroup", { name: "申请日期" }).getByRole("radio").first().check();
    assert.equal(
      await page
        .getByRole("button", { name: "下一步：准备宣传内容" })
        .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
      true,
    );
    assert.equal(await page.getByRole("radiogroup", { name: "申请日期" }).getByRole("radio").last().isEnabled(), false);
    await page.screenshot({ path: `${output}/banner-select-dark.png` });
    await page.getByRole("button", { name: "下一步：准备宣传内容" }).click();
    await page.getByRole("button", { name: "填入写作提纲" }).click();
    await page.getByRole("textbox", { name: "作品特色", exact: true }).fill("探索漂浮群岛，与好友一起发现隐藏遗迹。");
    assert.equal(await page.getByRole("button", { name: "填入写作提纲" }).isEnabled(), false);
    await page.getByRole("tab", { name: "更新内容", exact: true }).click();
    await page.getByRole("textbox", { name: "更新内容", exact: true }).fill("新增三处可探索岛屿");
    await page.getByRole("tab", { name: "作品特色", exact: true }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "作品特色", exact: true }).inputValue(),
      "探索漂浮群岛，与好友一起发现隐藏遗迹。",
    );
    await page.getByRole("button", { name: "申请记录", exact: true }).click();
    await page.getByText("待官方一审", { exact: true }).waitFor();
    await page.getByRole("button", { name: "修改申请", exact: true }).click();
    await page.getByRole("dialog", { name: "替换当前草稿？" }).waitFor();
    await page.getByRole("button", { name: "继续保留", exact: true }).click();
    await page.getByRole("button", { name: "新建申请", exact: true }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "作品特色", exact: true }).inputValue(),
      "探索漂浮群岛，与好友一起发现隐藏遗迹。",
    );
    await page.getByRole("button", { name: "作品活动", exact: true }).click();
    await page.getByRole("button", { name: "PE 轮播图申请", exact: true }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "作品特色", exact: true }).inputValue(),
      "探索漂浮群岛，与好友一起发现隐藏遗迹。",
    );
    await page.getByRole("button", { name: /选择宣传图/ }).click();
    await page.getByRole("dialog", { name: "裁剪作品图片" }).waitFor();
    await page.getByRole("button", { name: "取消裁剪" }).click();
    assert.equal(await page.getByRole("button", { name: "下一步：核对申请" }).isEnabled(), false);
    await page.getByRole("button", { name: /选择宣传图/ }).click();
    await page.getByRole("button", { name: "确认裁剪并上传" }).click();
    await page.getByRole("textbox", { name: "作品特色", exact: true }).fill("上传期间修改的作品特色也会保留");
    await page.getByText("宣传图.png", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("textbox", { name: "作品特色", exact: true }).inputValue(),
      "上传期间修改的作品特色也会保留",
    );
    await page.getByRole("textbox", { name: "作品特色", exact: true }).fill("探索漂浮群岛，与好友一起发现隐藏遗迹。");
    assert.equal(
      await page
        .getByRole("button", { name: "下一步：核对申请" })
        .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
      true,
    );
    await page.screenshot({ path: `${output}/banner-content-dark.png` });
    await page.getByRole("button", { name: "下一步：核对申请" }).click();
    await page.getByRole("button", { name: "上一步", exact: true }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "作品特色", exact: true }).inputValue(),
      "探索漂浮群岛，与好友一起发现隐藏遗迹。",
    );
    await page.getByRole("button", { name: "下一步：核对申请" }).click();
    assert.equal(Number(await page.locator("#writes").textContent()), initialBannerWrites);
    await page.screenshot({ path: `${output}/banner-review-dark.png` });
    await page.getByRole("button", { name: "确认并提交申请", exact: true }).click();
    await page.getByText("申请已提交，可在下方查看平台审核状态。").waitFor();
    assert.equal(Number(await page.locator("#writes").textContent()), initialBannerWrites + 1);
    await page.getByRole("button", { name: "修改申请", exact: true }).last().click();
    await page.getByRole("button", { name: "下一步：准备宣传内容" }).click();
    assert.equal(await page.getByRole("textbox", { name: "作品特色", exact: true }).inputValue(), "自由探索浮空群岛");
    await page.getByRole("button", { name: "退出修改" }).click();
    await page.getByRole("button", { name: "浅色", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("main")?.textContent.includes("正在读取平台数据"));
    await page.screenshot({ path: `${output}/banner-light.png` });
    await page.getByRole("button", { name: "申请记录", exact: true }).click();
    await page.screenshot({ path: `${output}/banner-history-light.png` });
    await page.getByRole("button", { name: "复用内容", exact: true }).first().click();
    assert.equal(await page.getByRole("button", { name: "下一步：准备宣传内容" }).isEnabled(), false);
    await page.getByRole("radiogroup", { name: "申请日期" }).getByRole("radio").first().check();
    await page.getByRole("button", { name: "下一步：准备宣传内容" }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "作品特色", exact: true }).inputValue(),
      "探索漂浮群岛，与好友一起发现隐藏遗迹。",
    );
    await page.getByRole("button", { name: "下一步：核对申请" }).click();
    await page.getByRole("checkbox", { name: "提交超时" }).check();
    await page.getByRole("button", { name: "确认并提交申请", exact: true }).click();
    await page
      .getByRole("alert")
      .getByText(/结果尚未确认/)
      .waitFor();
    assert.equal(await page.getByRole("button", { name: "确认并提交申请", exact: true }).isEnabled(), false);
    assert.equal(
      await page.getByRole("alert").evaluate((notice) => notice.getBoundingClientRect().bottom <= innerHeight),
      true,
    );
    await page.getByRole("checkbox", { name: "提交超时" }).uncheck();
    await page.getByRole("button", { name: "申请记录", exact: true }).click();
    await page.getByRole("checkbox", { name: "模拟失败" }).check();
    await page.getByRole("button", { name: "刷新记录", exact: true }).click();
    await page.getByText(/模拟网络不可用；当前显示上次加载的数据/).waitFor();
    await page.getByRole("checkbox", { name: "模拟失败" }).uncheck();
    await page.getByRole("button", { name: "重试", exact: true }).click();
  }
  if (!bannerOnly) {
    await page.getByRole("button", { name: "切换账号", exact: true }).click();
    await page.getByText("暂无作品活动", { exact: true }).waitFor();
    assert.equal(await page.getByText("秋日创作季 · 探索无限可能", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "切换账号", exact: true }).click();
    await page.getByRole("radio").first().waitFor();

    await page.getByRole("checkbox", { name: "提交超时" }).check();
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    await page.getByRole("textbox", { name: "作品介绍", exact: true }).fill("用于验证提交结果不确定的作品介绍");
    await page.getByRole("dialog").getByRole("button", { name: "确认提交" }).click();
    await page.getByText(/提交结果未确认/).waitFor();
    assert.equal(await page.getByRole("dialog").getByRole("button", { name: "确认提交" }).isEnabled(), false);
    await page.getByRole("dialog").getByRole("button", { name: "返回", exact: true }).click();
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    assert.equal(await page.getByRole("dialog").getByRole("button", { name: "确认提交" }).isEnabled(), false);
    await page.getByRole("button", { name: "关闭申请", exact: true }).click();
    await page.getByRole("button", { name: "Fluent", exact: true }).click();
    await page.setViewportSize({ width: 1100, height: 850 });
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    await page.screenshot({ path: `${output}/activities-fluent.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name: "关闭申请", exact: true }).click();
    await page.getByRole("button", { name: "浅色", exact: true }).click();
    await page.getByRole("button", { name: "填写申请", exact: true }).click();
    await page.screenshot({ path: `${output}/activity-application-light.png` });
    assert.equal(
      await page
        .getByRole("button", { name: "确认提交", exact: true })
        .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
      true,
    );
    await page.getByRole("button", { name: "关闭申请", exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    activityOnly
      ? "PASS: application dialog selection, draft retention/isolation, nested Escape, focus loop, materials, single submission, uncertain writes, discount flow, narrow viewport and three themes"
      : "PASS: navigation order, fixed panels, review/discount/banner flows, confirmation, pagination, stale failures, account isolation, uncertain writes, Ore dark/light and Fluent",
  );
} finally {
  await browser?.close();
  await server.close();
}
