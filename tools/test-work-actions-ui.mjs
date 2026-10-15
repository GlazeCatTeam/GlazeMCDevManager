import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}/node_modules/.cache/work-actions-ui`;
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
  const page = await browser.newPage({ viewport: { width: 1360, height: 1050 }, timezoneId: "America/Los_Angeles" });
  page.setDefaultTimeout(10000);
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    externalRequests.push(url.origin);
    return route.abort();
  });
  const url = `${server.resolvedUrls.local[0]}tests/fixtures/work-editor.html?actions=1`;
  const card = (name) =>
    page
      .getByRole("list", { name: "作品", exact: true })
      .getByRole("listitem")
      .filter({ has: page.getByText(name, { exact: true }) });
  const dialog = () => page.getByRole("dialog");
  const writes = () =>
    page.evaluate(() =>
      workActionFixture.requests.filter((r) =>
        [
          "works.cancelReview",
          "works.publish",
          "works.appointOnline",
          "works.cancelAppointOnline",
          "works.submitSelfTest",
          "works.cancelTest",
          "works.delete",
          "works.changePrice",
        ].includes(r.method),
      ),
    );
  /** Open only local fixture dialogs; all non-local requests are blocked */
  const open = async (name, action) => {
    await card(name).getByRole("button", { name: action, exact: true }).click();
    await dialog().waitFor();
  };
  /** Confirm and wait for the refreshed summary instead of trusting optimistic UI state */
  const confirm = async (action) => {
    await dialog()
      .getByRole("button", { name: `确认${action}`, exact: true })
      .click();
    await dialog().waitFor({ state: "hidden" });
  };
  await page.goto(`${url}&scheduled=1`);
  const scheduledCard = card("待定时上架的测试作品");
  await scheduledCard.getByText("定时上架中", { exact: true }).waitFor();
  await scheduledCard.getByText("定时上架 2098-12-31 18:30", { exact: true }).waitFor();
  assert.equal(await scheduledCard.getByText("未知", { exact: true }).count(), 0);
  assert.equal((await writes()).length, 0);
  await page.screenshot({ path: `${output}/scheduled.png`, fullPage: true });
  for (const width of [1360, 1100]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.equal(
      await scheduledCard.evaluate((c) =>
        [...c.querySelectorAll("button")].every(
          (b) => b.getBoundingClientRect().bottom <= c.getBoundingClientRect().bottom,
        ),
      ),
      true,
      `scheduled card buttons fit at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 1360, height: 1050 });
  await open("待定时上架的测试作品", "查看反馈");
  await dialog().getByText("审核通过，等待预约上架", { exact: true }).waitFor();
  await dialog().getByRole("button", { name: "关闭", exact: true }).click();
  await open("待定时上架的测试作品", "取消定时上架");
  await dialog().getByText("当前预约：2098-12-31 18:30", { exact: true }).waitFor();
  await dialog().getByRole("button", { name: "取消", exact: true }).click();
  assert.equal((await writes()).length, 0);
  await open("待定时上架的测试作品", "取消定时上架");
  await confirm("取消定时上架");
  await scheduledCard.getByText("待上架", { exact: true }).waitFor();
  assert.equal(await scheduledCard.getByText(/^定时上架 2098/).count(), 0);
  assert.equal((await writes()).length, 1);
  assert.equal((await writes())[0].method, "works.cancelAppointOnline");
  await page.goto(url);
  await card("审核中的测试作品").waitFor();
  assert.equal((await writes()).length, 0);
  assert.equal(await card("免费已上架作品").getByRole("button", { name: "调整定价" }).isDisabled(), true);
  await page.screenshot({ path: `${output}/list.png`, fullPage: true });
  await open("审核中的测试作品", "取消审核");
  await dialog().getByRole("button", { name: "取消", exact: true }).click();
  assert.equal((await writes()).length, 0);
  await open("审核中的测试作品", "取消审核");
  await confirm("取消审核");
  await card("审核中的测试作品").getByText("待提交审核", { exact: true }).waitFor();
  await open("待上架的测试作品", "上架");
  await confirm("上架");
  await card("待上架的测试作品").getByText("已上架", { exact: true }).waitFor();
  await open("待自测的测试作品", "提交自测");
  assert.equal(await dialog().getByRole("checkbox", { name: "免机审" }).isChecked(), false);
  await dialog().getByRole("checkbox", { name: "免机审" }).check();
  await confirm("提交自测");
  await card("待自测的测试作品").getByText("自测中", { exact: true }).waitFor();
  assert.equal((await writes()).at(-1).params.passCheck, true);
  await open("自测中的测试作品", "取消自测");
  await confirm("取消自测");
  await card("自测中的测试作品").getByText("待提交审核", { exact: true }).waitFor();
  await open("钻石定价测试作品", "调整定价");
  assert.equal(await dialog().getByRole("button", { name: "确认调整定价" }).isDisabled(), true);
  await dialog().getByRole("combobox").selectOption("1000");
  await page.screenshot({ path: `${output}/price.png`, fullPage: true });
  await confirm("调整定价");
  await card("钻石定价测试作品").getByText("1000", { exact: true }).waitFor();
  await open("绿宝石定价测试作品", "调整定价");
  await dialog().getByRole("spinbutton").fill("150");
  assert.equal(await dialog().getByRole("button", { name: "确认调整定价" }).isDisabled(), true);
  await dialog().getByRole("spinbutton").fill("200");
  await confirm("调整定价");
  await card("绿宝石定价测试作品").getByText("200", { exact: true }).waitFor();
  await open("待定时上架的测试作品", "定时上架");
  await dialog().getByLabel("上架日期", { exact: true }).fill("2000-01-01");
  assert.equal(await dialog().getByRole("button", { name: "确认定时上架" }).isDisabled(), true);
  await dialog().getByLabel("上架日期", { exact: true }).fill("2099-02-30");
  assert.equal(await dialog().getByRole("button", { name: "确认定时上架" }).isDisabled(), true);
  await dialog().getByRole("button", { name: "明天 09:00" }).click();
  const tomorrow = await page.evaluate(() => new Date(Date.now() + 32 * 3600_000).toISOString().slice(0, 10));
  assert.equal(await dialog().getByLabel("上架日期", { exact: true }).inputValue(), tomorrow);
  assert.equal(await dialog().getByLabel("上架小时").inputValue(), "09");
  assert.equal(await dialog().getByLabel("上架分钟").inputValue(), "00");
  await dialog().getByRole("button", { name: "下个月", exact: true }).click();
  await dialog().getByRole("button", { name: "明天 09:00" }).click();
  assert.equal(
    await dialog().getByRole("button", { name: tomorrow, exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await dialog().getByLabel("上架日期", { exact: true }).fill("2099-01-01");
  await dialog().getByRole("button", { name: "上个月", exact: true }).click();
  await dialog().getByRole("button", { name: "2098-12-31", exact: true }).click();
  assert.equal(await dialog().getByLabel("上架日期", { exact: true }).inputValue(), "2098-12-31");
  await page.keyboard.press("ArrowRight");
  assert.equal(await dialog().getByLabel("上架日期", { exact: true }).inputValue(), "2099-01-01");
  assert.equal(await page.locator(":focus").getAttribute("aria-label"), "2099-01-01");
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus").getAttribute("aria-label"), "上架日期");
  await dialog().getByLabel("上架小时").fill("24");
  assert.equal(await dialog().getByRole("button", { name: "确认定时上架" }).isDisabled(), true);
  await dialog().getByLabel("上架小时").fill("10");
  await dialog().getByLabel("上架分钟").fill("60");
  assert.equal(await dialog().getByRole("button", { name: "确认定时上架" }).isDisabled(), true);
  await dialog().getByLabel("上架分钟").fill("30");
  await dialog().getByRole("status").getByText("2099/01/01 周四 10:30").waitFor();
  await page.screenshot({ path: `${output}/schedule.png`, fullPage: true });
  await dialog().screenshot({ path: `${output}/schedule-dialog.png` });
  await page.setViewportSize({ width: 960, height: 640 });
  const bounds = await dialog().boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 640, "dialog must fit a short window");
  assert.equal(await dialog().getByRole("button", { name: "确认定时上架" }).isVisible(), true);
  await page.screenshot({ path: `${output}/schedule-short.png`, fullPage: true });
  await page.setViewportSize({ width: 1360, height: 1050 });
  await confirm("定时上架");
  assert.equal((await writes()).at(-1).params.appointOnlineTime, "2099-01-01 10:30:00");
  await open("待定时上架的测试作品", "定时上架");
  await dialog().getByText("当前预约：2099-01-01 10:30:00").waitFor();
  assert.equal(await dialog().getByLabel("上架日期", { exact: true }).inputValue(), "2099-01-01");
  assert.equal(await dialog().getByLabel("上架小时").inputValue(), "10");
  assert.equal(await dialog().getByLabel("上架分钟").inputValue(), "30");
  await dialog().getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(
    "PASS: Ore calendar, keyboard navigation, shortcuts, invalid dates/times, Beijing time in another timezone, existing appointment and short-window layout",
  );
  await open("待删除的测试作品", "删除");
  await page.screenshot({ path: `${output}/delete.png`, fullPage: true });
  const count = (await writes()).length;
  await dialog().getByRole("button", { name: "确认删除" }).click();
  assert.equal(await dialog().getByRole("button", { name: "正在处理…" }).isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await dialog().count(), 1);
  await dialog().waitFor({ state: "hidden" });
  await card("待删除的测试作品").waitFor({ state: "hidden" });
  assert.equal((await writes()).length, count + 1);

  // Deleting the only item on the last page returns to a valid previous page.
  await page.goto(url);
  await page.getByRole("button", { name: "下一页" }).click();
  await open("末页待删除作品", "删除");
  await confirm("删除");
  await card("审核中的测试作品").waitFor();
  await page.getByRole("navigation", { name: "分页" }).waitFor({ state: "hidden" });

  // A rejection retains the form; a changed status is never presented as success.
  for (const failure of ["reject", "expired", "conflict"]) {
    await page.goto(`${url}&actionFailure=${failure}`);
    await open("审核中的测试作品", "取消审核");
    await dialog().getByRole("button", { name: "确认取消审核" }).click();
    await dialog()
      .getByText(failure === "reject" ? /模拟平台拒绝/ : failure === "expired" ? /模拟登录已过期/ : /作品状态已变化/)
      .waitFor();
    assert.equal((await writes()).length, 1);
    await dialog().getByRole("button", { name: "取消", exact: true }).click();
  }

  // Unknown results survive closing/reopening, preventing accidental duplicate submission.
  await page.goto(`${url}&actionFailure=uncertain`);
  await open("待定时上架的测试作品", "定时上架");
  await dialog().getByRole("button", { name: "确认定时上架" }).click();
  await dialog()
    .getByText(/上次操作结果未能确认/)
    .waitFor();
  assert.equal(await dialog().getByRole("button", { name: "确认定时上架" }).count(), 0);
  await dialog().getByRole("button", { name: "返回列表核对" }).click();
  await open("待定时上架的测试作品", "定时上架");
  await dialog()
    .getByText(/上次操作结果未能确认/)
    .waitFor();
  assert.equal((await writes()).length, 1);
  await dialog().getByRole("button", { name: "已核对结果，返回列表" }).click();
  await page.evaluate(() => workActionFixture.fail(null));
  await open("待定时上架的测试作品", "定时上架");
  await confirm("定时上架");
  assert.equal((await writes()).length, 2);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.screenshot({ path: `${output}/list-narrow.png`, fullPage: true });
  const clipped = await page
    .getByRole("list", { name: "作品", exact: true })
    .getByRole("listitem")
    .evaluateAll((cards) =>
      cards
        .filter((c) =>
          [...c.querySelectorAll("button")].some(
            (b) => b.getBoundingClientRect().bottom > c.getBoundingClientRect().bottom,
          ),
        )
        .map((c) => c.textContent),
    );
  assert.deepEqual(clipped, [], "card buttons must remain visible");
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(
    "PASS: eight operations, scheduled feedback/cancellation, cancel/no-write, pricing, Beijing time in another timezone, pending guard, pagination after deletion, rejection/expiry/conflict and uncertain-result reconciliation; zero external requests",
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
