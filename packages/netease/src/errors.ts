// Error model for every NetEase call; callers must handle the failure branch

export type NeteaseError =
  | { kind: "session_expired" }
  | { kind: "network"; cause: string }
  | { kind: "timeout" }
  | { kind: "business"; code: string; message: string }
  | { kind: "parse"; endpoint: string; detail?: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: NeteaseError };

/** Wrap a value as a successful result */
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/** Wrap an error as a failed result */
export const fail = <T>(error: NeteaseError): Result<T> => ({ ok: false, error });

/** Chinese message for an error, shown in the UI and safe to log (never contains credentials) */
export function describeError(error: NeteaseError): string {
  switch (error.kind) {
    case "session_expired":
      return "登录已过期，请重新登录";
    case "network":
      return "网络连接失败，请检查网络后重试";
    case "timeout":
      return "网易平台响应超时，请稍后重试";
    case "business":
      return error.message || `网易平台返回错误（${error.code}）`;
    case "parse":
      return error.detail ? `网易平台数据解析失败：${error.detail}` : "网易平台返回的数据格式无法识别";
  }
}
