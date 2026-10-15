import { isWorkRecord, type WorkUpload } from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { isNeteaseImageUrl } from "../http/hosts";

/** Accept only the FP upload hosts issued by this service, without cookie forwarding */
export function resolveWorkUploadUrl(token: string): string {
  const encoded = token.slice(token.indexOf(":") + 1).trim();
  const payload: unknown = JSON.parse(atob(encoded));
  if (!isWorkRecord(payload) || typeof payload.url !== "string") throw new Error("上传 token 缺少地址");
  const url = new URL(payload.url);
  if (
    url.protocol !== "https:" ||
    !["x19.fp.ps.netease.com", "x19.pfp.ps.netease.com"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error("上传服务地址不受支持");
  return url.href;
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

/** Upload the chosen file as a streaming Blob with a platform-issued policy */
export async function uploadWorkFile(
  session: NeteaseSession,
  file: Blob,
  name: string,
  fileType: "image" | "video" | "zip_package",
): Promise<Result<WorkUpload>> {
  const token = await getMcDevData(
    "filepicker.file_token",
    withQuery("/filepicker/file_token", { file_type: fileType, secure: "false" }),
    session,
  );
  if (!token.ok) return token;
  if (!isWorkRecord(token.value) || typeof token.value.token !== "string")
    return fail({ kind: "parse", endpoint: "filepicker.file_token" });
  try {
    const target = resolveWorkUploadUrl(token.value.token);
    const form = new FormData();
    form.append("Authorization", token.value.token);
    form.append("fpfile", file, name);
    const response = await fetch(target, {
      method: "POST",
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(600_000),
    });
    if (!response.ok) return fail({ kind: "business", code: String(response.status), message: "文件上传失败" });
    const uploaded = parseWorkUploadReply(
      await response.text(),
      response.headers.get("x-ntes-signature"),
      fileType,
      name,
      file.size,
    );
    return uploaded ? ok(uploaded) : fail({ kind: "parse", endpoint: "filepicker.upload" });
  } catch (error) {
    return error instanceof DOMException && error.name === "TimeoutError"
      ? fail({ kind: "timeout" })
      : fail({ kind: "business", code: "upload_failed", message: "文件上传失败，请检查文件及网络后重试" });
  }
}
