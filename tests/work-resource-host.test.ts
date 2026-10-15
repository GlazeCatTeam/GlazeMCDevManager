import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { pickAndUploadWorkFile, uploadDroppedWorkResource } from "../apps/desktop/src/main/ipc/work-files";
import type { SessionManager } from "../apps/desktop/src/main/session/session-manager";
import { RPC_CHANNEL, type WorkResourceUploadParams } from "../packages/contracts/src";

const directory = mkdtempSync(join(tmpdir(), "glaze-resource-test-"));
app.setPath("userData", directory);
app.commandLine.appendSwitch("disable-gpu");

/** Exercise the real preload File bridge and host streaming with all HTTP replaced by fixtures */
async function verify() {
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    webPreferences: { preload: process.argv[2], contextIsolation: true, sandbox: true },
  });
  let account = "a",
    uploads = 0,
    invocations = 0,
    swapDuringRead = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const json = (data: unknown) => new Response(JSON.stringify({ status: "ok", data }));
    if (url.endsWith("/items/mc_consts/")) {
      if (swapDuringRead) account = "b";
      return json({
        pri_type: {
          pe: [
            { id: 2, title: "add_ons" },
            { id: 4, title: "皮肤" },
          ],
        },
        sub_type: {
          pe: { 2: [{ id: 1, title: "包", file_type: "zip" }], 4: [{ id: 1, title: "皮肤", file_type: "png" }] },
        },
        channel: { pe: [] },
      });
    }
    if (url.endsWith("/item-tag/")) return json({ tag_list: [] });
    if (url.endsWith("/users/me")) return json({ prerequisite_switch: true });
    if (url.includes("/filepicker/file_token"))
      return json({ token: `fp:${btoa(JSON.stringify({ url: "https://x19.fp.ps.netease.com/upload" }))}` });
    assert.equal(url, "https://x19.fp.ps.netease.com/upload");
    assert.equal((init?.headers as Record<string, string>)?.Cookie, undefined);
    assert.ok(init?.body instanceof FormData);
    const file = init.body.get("fpfile") as File;
    assert.ok((await file.arrayBuffer()).byteLength > 0);
    uploads++;
    return new Response('<textarea>{"url":"https://x19.fp.ps.netease.com/test-resource"}</textarea>', {
      headers: { "x-ntes-signature": "fixture" },
    });
  };
  const sessions = {
    current: () => ({ id: account }),
    request: async (
      _account: string,
      call: (session: { sessionCookie: string }) => Promise<{ ok: boolean; value?: unknown }>,
    ) => {
      const result = await call({ sessionCookie: "fixture-only" });
      if (!result.ok) throw new Error("Unexpected fixture rejection");
      return result.value;
    },
  } as SessionManager;
  ipcMain.handle(RPC_CHANNEL, async (event, request) => {
    invocations++;
    assert.equal(event.sender, window.webContents);
    assert.equal(request.method, "works.uploadDroppedResource");
    try {
      const value = await uploadDroppedWorkResource(sessions, window, request.params, request.params.nativePath);
      return { ok: true, value };
    } catch {
      return { ok: false, error: { kind: "validation", message: "rejected" } };
    }
  });
  await window.loadURL("data:text/html,<input type=file id=source>");
  window.webContents.debugger.attach("1.3");
  const tree = await window.webContents.debugger.sendCommand("DOM.getDocument");
  const { nodeId } = await window.webContents.debugger.sendCommand("DOM.querySelector", {
    nodeId: tree.root.nodeId,
    selector: "#source",
  });
  for (const extension of ["zip", "mcworld", "mcpack", "mcaddon", "png"]) {
    const path = join(directory, `资源.${extension}`);
    writeFileSync(path, "isolated file transport fixture");
    await window.webContents.debugger.sendCommand("DOM.setFileInputFiles", { nodeId, files: [path] });
    const type = extension === "png" ? 4 : 2;
    const result = await window.webContents.executeJavaScript(
      `window.glaze.uploadDroppedResource(document.querySelector('#source').files[0],{account:'a',resourceType:${type}})`,
    );
    assert.equal(result.ok, true, extension);
    assert.equal(result.value.name, `资源.${extension}`);
    assert.equal("path" in result.value, false);
    assert.equal(result.value.receipt.file_type, "zip_package");
  }
  assert.equal(uploads, 5);
  const before = invocations;
  assert.equal(
    (
      await window.webContents.executeJavaScript(
        "window.glaze.uploadDroppedResource(new File(['x'],'fake.zip'),{account:'a',resourceType:2})",
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await window.webContents.executeJavaScript(
        "window.glaze.rpc('works.uploadDroppedResource',{account:'a',resourceType:2,nativePath:'fake'})",
      )
    ).ok,
    false,
  );
  assert.equal(invocations, before);
  assert.equal(
    (
      await window.webContents.executeJavaScript(
        "window.glaze.uploadDroppedResource(document.querySelector('#source').files[0],{account:'a',resourceType:2})",
      )
    ).ok,
    false,
  );
  const params: WorkResourceUploadParams = { account: "a", resourceType: 2 };
  const zip = join(directory, "资源.zip");
  await assert.rejects(uploadDroppedWorkResource(sessions, window, params, directory), /有效文件/);
  const exe = join(directory, "invalid.exe");
  writeFileSync(exe, "invalid");
  await assert.rejects(uploadDroppedWorkResource(sessions, window, params, exe), /有效文件/);
  swapDuringRead = true;
  await assert.rejects(uploadDroppedWorkResource(sessions, window, params, zip), /账号已变化/);
  assert.equal(uploads, 5);
  swapDuringRead = false;
  account = "a";
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [zip] });
  assert.equal((await pickAndUploadWorkFile(sessions, window, { ...params, kind: "resource" }))?.name, "资源.zip");
  assert.equal(uploads, 6);
  window.destroy();
  console.log(
    "PASS: real sandbox preload File bridge, five formats, picker parity, category mismatch, synthetic File/path rejection, directory/extension rejection and account switch; all HTTP stubbed",
  );
}
verify()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
