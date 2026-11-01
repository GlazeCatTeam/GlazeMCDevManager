import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { registerRemoteMediaSchemes } from "../../apps/desktop/src/main/protocols/remote-media";
import { handleRemoteVideos, serveRemoteVideo } from "../../apps/desktop/src/main/protocols/remote-video";
import { remoteVideoUrl } from "../../packages/contracts/src";

app.setPath("userData", mkdtempSync(join(tmpdir(), "glaze-video-test-")));
registerRemoteMediaSchemes();
app.on("window-all-closed", () => app.quit());
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 1000,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true },
  });
  await win.loadURL("about:blank");
  const recording = await win.webContents.executeJavaScript(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const ctx = canvas.getContext('2d'); const stream = canvas.captureStream(25);
    const mimeType = ['video/mp4;codecs=avc1.42001E', 'video/mp4', 'video/webm;codecs=vp8'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw Error('No recording codec');
    const recorder = new MediaRecorder(stream, {mimeType}); const chunks = [];
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.ondataavailable = event => chunks.push(event.data); recorder.start();
    for(let i = 0; i < 40; i++) { ctx.fillStyle = i % 2 ? '#347eae' : '#579d32'; ctx.fillRect(0,0,320,180); ctx.fillStyle='#fff';ctx.font='28px sans-serif';ctx.fillText('Video preview ' + i,40,95); await new Promise(resolve => setTimeout(resolve,40)); }
    recorder.stop(); await stopped; stream.getTracks().forEach(track=>track.stop());
    return {bytes:Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())), mimeType};
  })()`);
  const bytes = new Uint8Array(recording.bytes);
  const requests: string[] = [];
  let failure = false;
  globalThis.fetch = async (input, options) => {
    assert.ok(String(input).startsWith("https://x19.fp.ps.netease.com/"));
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.redirect, "error");
    const headers = new Headers(options?.headers);
    assert.equal(headers.has("Cookie"), false);
    assert.equal(headers.has("Authorization"), false);
    const range = headers.get("Range");
    requests.push(range ?? "full");
    if (failure) return new Response(null, { status: 503 });
    const match = range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
    const body = bytes.slice(start, end + 1);
    return new Response(options?.method === "HEAD" ? null : body, {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": recording.mimeType,
        "Content-Length": String(body.length),
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {}),
      },
    });
  };
  Object.assign(globalThis, {
    videoTest: {
      requests,
      mimeType: recording.mimeType,
      fail: (value: boolean) => {
        failure = value;
      },
      async verifyTransport() {
        const source = remoteVideoUrl("https://x19.fp.ps.netease.com/fixture.mp4");
        assert.ok(source);
        const response = await serveRemoteVideo(
          new Request(source, { headers: { Range: "bytes=4-19", Cookie: "must-not-forward" } }),
        );
        assert.equal(response.status, 206);
        assert.equal(response.headers.get("Content-Range"), `bytes 4-19/${bytes.length}`);
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(4, 20));
        for (const target of [
          "https://example.com/a.mp4",
          "http://x19.fp.ps.netease.com/a.mp4",
          "https://user:secret@x19.fp.ps.netease.com/a.mp4",
        ]) {
          assert.equal((await serveRemoteVideo(new Request(remoteVideoUrl(target) ?? ""))).status, 403);
        }
        assert.equal(
          (await serveRemoteVideo(new Request(source, { headers: { Range: "bytes=0-5,10-15" } }))).status,
          416,
        );
        assert.equal((await serveRemoteVideo(new Request(source, { method: "POST" }))).status, 405);
        failure = true;
        assert.equal((await serveRemoteVideo(new Request(source))).status, 502);
        failure = false;
      },
    },
  });
  handleRemoteVideos();
  const pageUrl = process.argv.find((value) => value.startsWith("http://127.0.0.1:"));
  assert.ok(pageUrl);
  await win.loadURL(pageUrl);
});
