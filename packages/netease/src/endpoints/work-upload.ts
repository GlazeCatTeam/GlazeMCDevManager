import { isWorkRecord, type WorkUpload } from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { isNeteaseImageUrl } from "../http/hosts";

/** FP upload hosts the platform issues for work material; any other host is refused */
const UPLOAD_HOSTS = ["x19.fp.ps.netease.com", "x19.pfp.ps.netease.com", "fp.ps.netease.com", "pfp.ps.netease.com"];

/** Uploads may bounce to a second storage node, but never without re-checking the target */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_UPLOAD_REDIRECTS = 3;

/** Accept only an HTTPS FP upload address without credentials, port or host suffix tricks */
function acceptUploadAddress(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("上传服务地址无法解析");
  }
  if (url.protocol !== "https:" || !UPLOAD_HOSTS.includes(url.hostname) || url.port || url.username || url.password)
    throw new Error(`上传服务地址不受支持（协议=${url.protocol}，主机=${url.hostname}，端口=${url.port || "默认"}）`);
  return url.href;
}

/** Accept only the FP upload hosts issued by this service, without cookie forwarding */
export function resolveWorkUploadUrl(token: string): string {
  const encoded = token.slice(token.indexOf(":") + 1).trim();
  const payload: unknown = JSON.parse(atob(encoded));
  if (!isWorkRecord(payload) || typeof payload.url !== "string") throw new Error("上传 token 缺少地址");
  return acceptUploadAddress(payload.url);
}

/**
 * Post the signed form, following redirects by hand.
 * The secure resource policy answers with a redirect to the storage node, so `redirect: "error"`
 * turned every zip upload into an unexplained transport failure; each hop is re-validated against
 * the upload allowlist so a redirect can never move the form to another host.
 */
async function postUploadForm(target: string, form: FormData, signal: AbortSignal): Promise<Response> {
  let current = target;
  for (let hop = 0; ; hop += 1) {
    const response = await fetch(current, { method: "POST", body: form, redirect: "manual", signal });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error(`上传服务要求跳转但未给出地址（HTTP ${response.status}）`);
    if (hop >= MAX_UPLOAD_REDIRECTS) throw new Error(`上传服务跳转次数过多（超过 ${MAX_UPLOAD_REDIRECTS} 次）`);
    current = acceptUploadAddress(new URL(location, current).href);
  }
}

/** Parse the signed FP reply; retain the original receipt body for the update DTO */
export function parseWorkUploadReply(
  text: string,
  sign: string | null,
  fileType: string,
  name: string,
  size: number,
): WorkUpload | null {
  const body = (/<textarea[^>]*>([\s\S]*?)<\/textarea>/i.exec(text)?.[1] ?? text).trim();
  if (!sign) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isWorkRecord(parsed)) return null;
    const url = parsed.url ?? parsed.filename;
    if (typeof url !== "string" || !isNeteaseImageUrl(url)) return null;
    return { name, size, url, receipt: { body, sign, file_type: fileType } };
  } catch {
    return null;
  }
}

/** Upload with a secure resource policy or the standard image/video policy, retaining signed replies */
export async function uploadWorkFile(
  session: NeteaseSession,
  file: Blob,
  name: string,
  fileType: "image" | "video" | "zip_package",
  beforeWrite?: () => void,
): Promise<Result<WorkUpload>> {
  const token = await getMcDevData(
    "filepicker.file_token",
    withQuery("/filepicker/file_token", { file_type: fileType, secure: fileType === "zip_package" ? "true" : "false" }),
    session,
  );
  if (!token.ok) return token;
  if (!isWorkRecord(token.value) || typeof token.value.token !== "string")
    return fail({ kind: "parse", endpoint: "filepicker.file_token" });
  let stage = "上传地址校验";
  try {
    const target = resolveWorkUploadUrl(token.value.token);
    stage = "上传表单构造";
    const form = new FormData();
    form.append("Authorization", token.value.token);
    form.append("fpfile", file, name);
    stage = "上传权限复核";
    beforeWrite?.();
    stage = "上传传输";
    const response = await postUploadForm(target, form, AbortSignal.timeout(600_000));
    if (!response.ok) return fail({ kind: "business", code: String(response.status), message: "文件上传失败" });
    stage = "上传响应读取";
    const uploaded = parseWorkUploadReply(
      await response.text(),
      response.headers.get("x-ntes-signature"),
      fileType,
      name,
      file.size,
    );
    return uploaded ? ok(uploaded) : fail({ kind: "parse", endpoint: "filepicker.upload" });
  } catch (error) {
    const name = error instanceof Error && /^[a-z]+$/i.test(error.name) ? error.name : "Error";
    const cause = error instanceof Error ? error.cause : undefined;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    const policy =
      stage === "上传地址校验" &&
      error instanceof Error &&
      (error.message === "上传 token 缺少地址" || error.message.startsWith("上传服务地址不受支持（"))
        ? `：${error.message}`
        : "";
    const suffix = typeof code === "string" && /^[a-z0-9_]{1,60}$/i.test(code) ? `，${code}` : "";
    return error instanceof DOMException && error.name === "TimeoutError"
      ? fail({ kind: "timeout" })
      : fail({
          kind: "business",
          code: "upload_failed",
          message: `文件上传失败（${stage}，${name}${suffix}）${policy}`,
        });
  }
}
