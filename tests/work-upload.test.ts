import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { resolveWorkUploadUrl, uploadWorkFile } from "../packages/netease/src/endpoints/work-upload";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "private-account-cookie" };
const policy = (url: string) => `Policy signature:${btoa(JSON.stringify({ url }))}`;
const issuedUrl = "https://pfp.ps.netease.com/x19/file/new/";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("accepts the bare PFP host issued by the platform without forwarding account cookies", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const token = policy(issuedUrl);
  globalThis.fetch = (async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return calls.length === 1
      ? new Response(JSON.stringify({ status: "ok", data: { token } }))
      : new Response(JSON.stringify({ url: "https://pfp.ps.netease.com/uploaded.zip" }), {
          headers: { "x-ntes-signature": "private-receipt-signature" },
        });
  }) as typeof fetch;
  const result = await uploadWorkFile(session, new Blob(["package"]), "package.zip", "zip_package");
  assert.equal(result.ok, true);
  assert.equal(resolveWorkUploadUrl(token), issuedUrl);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.url, issuedUrl);
  assert.equal(calls[1]?.init.method, "POST");
  assert.equal(calls[1]?.init.redirect, "error");
  assert.equal(new Headers(calls[1]?.init.headers).has("Cookie"), false);
  const form = calls[1]?.init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("Authorization"), token);
});

test("new host keeps HTTPS, credentials, exact-host and port restrictions", () => {
  for (const url of [
    "http://pfp.ps.netease.com/x19/file/new/",
    "https://user:password@pfp.ps.netease.com/x19/file/new/",
    "https://pfp.ps.netease.com:9443/x19/file/new/",
    "https://pfp.ps.netease.com.evil.example/x19/file/new/",
  ])
    assert.throws(() => resolveWorkUploadUrl(policy(url)));
});

test("policy validation failure identifies its stage without echoing the policy or cookie", async () => {
  const token = policy("https://evil.example/upload?secret=private-policy-query");
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ status: "ok", data: { token } }));
  }) as typeof fetch;
  const result = await uploadWorkFile(session, new Blob(["package"]), "package.zip", "zip_package");
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result), /上传地址校验/);
  for (const secret of [token, session.sessionCookie, "private-policy-query"])
    assert.equal(JSON.stringify(result).includes(secret), false);
});

test("transport failure reports safe error codes and sends the upload only once", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    if (++calls === 1) return new Response(JSON.stringify({ status: "ok", data: { token: policy(issuedUrl) } }));
    throw new TypeError("fetch failed private-account-cookie", {
      cause: Object.assign(new Error("private-receipt-signature"), { code: "ECONNRESET" }),
    });
  }) as typeof fetch;
  const result = await uploadWorkFile(session, new Blob(["package"]), "package.zip", "zip_package");
  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result), /上传传输.*ECONNRESET/);
  assert.doesNotMatch(JSON.stringify(result), /private-account-cookie|private-receipt-signature/);
});

test("upload timeout keeps the timeout classification", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    if (++calls === 1) return new Response(JSON.stringify({ status: "ok", data: { token: policy(issuedUrl) } }));
    throw new DOMException("private-account-cookie", "TimeoutError");
  }) as typeof fetch;
  assert.deepEqual(await uploadWorkFile(session, new Blob(["package"]), "package.zip", "zip_package"), {
    ok: false,
    error: { kind: "timeout" },
  });
});
