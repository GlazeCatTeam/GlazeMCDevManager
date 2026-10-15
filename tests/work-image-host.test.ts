import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, nativeImage } from "electron";
import { discardWorkImage, prepareWorkImage, uploadCroppedWorkImage } from "../apps/desktop/src/main/ipc/work-image";
import type { SessionManager } from "../apps/desktop/src/main/session/session-manager";

const directory = mkdtempSync(join(tmpdir(), "glaze-crop-test-"));
app.setPath("userData", directory);
app.commandLine.appendSwitch("disable-gpu");

/** Test native snapshots and uploads with hidden windows and a completely stubbed transport */
async function verify() {
  await app.whenReady();
  const owner = new BrowserWindow({ show: false });
  const other = new BrowserWindow({ show: false });
  const path = join(directory, "fixture.png");
  const image = nativeImage.createFromBitmap(Buffer.alloc(300 * 200 * 4, 255), { width: 300, height: 200 });
  assert.equal(image.isEmpty(), false);
  writeFileSync(path, image.toPNG());
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  let account = "a";
  let uploads = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/filepicker/file_token"))
      return new Response(
        JSON.stringify({
          status: "ok",
          data: { token: `fp:${btoa(JSON.stringify({ url: "https://x19.fp.ps.netease.com/upload" }))}` },
        }),
      );
    assert.equal(url, "https://x19.fp.ps.netease.com/upload");
    assert.equal((init?.headers as Record<string, string> | undefined)?.Cookie, undefined);
    const body = init?.body as FormData;
    const file = body.get("fpfile") as File;
    const size = nativeImage.createFromBuffer(Buffer.from(await file.arrayBuffer())).getSize();
    assert.deepEqual(size, { width: 940, height: 450 });
    uploads++;
    return new Response('<textarea>{"url":"https://x19.fp.ps.netease.com/cropped.png"}</textarea>', {
      headers: { "x-ntes-signature": "unit-test" },
    });
  };
  const sessions = {
    current: () => ({ id: account }),
    request: async (
      _id: string,
      call: (session: { sessionCookie: string }) => Promise<{ ok: boolean; value?: unknown }>,
    ) => {
      const result = await call({ sessionCookie: "unit-test-only" });
      if (!result.ok) throw new Error("fixture request rejected");
      return result.value;
    },
  } as SessionManager;
  const draft = await prepareWorkImage(sessions, owner, { account: "a", kind: "banner" });
  assert.ok(draft);
  assert.equal(draft.width, 300);
  assert.equal(draft.targetWidth, 940);
  assert.equal("path" in draft, false);
  const params = { account: "a", token: draft.token, crop: { x: 0, y: 28, width: 300, height: 144 } };
  await assert.rejects(uploadCroppedWorkImage(sessions, other, params), /失效/);
  await assert.rejects(
    uploadCroppedWorkImage(sessions, owner, { ...params, crop: { x: -1, y: 0, width: 1, height: 1 } }),
    /裁剪区域/,
  );
  account = "b";
  await assert.rejects(uploadCroppedWorkImage(sessions, owner, params), /账号已切换/);
  account = "a";
  assert.equal(uploads, 0);
  // Changing the source file after selection cannot change the retained snapshot.
  writeFileSync(path, "changed after picker");
  const result = await uploadCroppedWorkImage(sessions, owner, params);
  assert.equal(result.url, "https://x19.fp.ps.netease.com/cropped.png");
  assert.equal(uploads, 1);
  await assert.rejects(uploadCroppedWorkImage(sessions, owner, params), /失效/);
  writeFileSync(path, image.toPNG());
  const cancelled = await prepareWorkImage(sessions, owner, { account: "a", kind: "banner" });
  assert.ok(cancelled);
  discardWorkImage("a", cancelled.token, owner);
  await assert.rejects(uploadCroppedWorkImage(sessions, owner, { ...params, token: cancelled.token }), /失效/);
  assert.equal(uploads, 1);
  owner.destroy();
  other.destroy();
  console.log(
    "PASS: hidden native image picker/crop, exact output size, immutable snapshot, account/window isolation, invalid crop, discard and single-use upload; all transport stubbed",
  );
}
verify()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
