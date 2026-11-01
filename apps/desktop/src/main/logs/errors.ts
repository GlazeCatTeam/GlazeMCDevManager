import { redactLog } from "./service";

/** Read only diagnostic fields; never serialize errors, causes, requests or platform payloads */
export function describeLogError(error: unknown): string {
  try {
    return diagnosticFields(error);
  } catch {
    return "类别=internal；原因=错误诊断信息无法读取";
  }
}

/** Isolate property access because foreign errors may contain throwing accessors */
function diagnosticFields(error: unknown): string {
  const value = error && typeof error === "object" ? (error as Record<string, unknown>) : undefined;
  const cause = value?.cause && typeof value.cause === "object" ? (value.cause as Record<string, unknown>) : undefined;
  const platform =
    cause &&
    typeof cause.kind === "string" &&
    ["business", "parse", "network", "timeout", "session_expired"].includes(cause.kind)
      ? cause
      : undefined;
  const code = (input: unknown) => (typeof input === "string" && /^[a-z\d_.-]{1,80}$/i.test(input) ? input : undefined);
  const kind = code(platform?.kind) ?? code(value?.kind) ?? "internal";
  const platformCode = code(platform?.code ?? value?.code);
  const http = platform?.httpStatus ?? value?.httpStatus;
  const endpoint = code(platform?.endpoint ?? value?.endpoint);
  const message = typeof value?.message === "string" ? value.message : typeof error === "string" ? error : "未知错误";
  const detail =
    platform?.kind === "parse" ? platform.detail : platform?.kind === "network" ? platform.cause : undefined;
  const explanation = typeof detail === "string" && !message.includes(detail) ? `${message}；${detail}` : message;
  // Exception messages may embed request JSON or an HTML response; keep the surrounding explanation only
  const reason = redactLog(
    explanation
      .replace(/\{[\s\S]*\}|\[[\s\S]*\]|[[{][\s\S]*$/g, "[结构化内容已隐藏]")
      .replace(/<(?:!doctype|html)\b[\s\S]*/gi, "[响应正文已隐藏]"),
  ).slice(0, 700);
  return [
    `类别=${kind}`,
    ...(platformCode ? [`错误码=${platformCode}`] : []),
    ...(typeof http === "number" && Number.isInteger(http) && http >= 100 && http <= 599 ? [`HTTP=${http}`] : []),
    ...(endpoint ? [`接口=${endpoint}`] : []),
    `原因=${reason}`,
  ].join("；");
}
