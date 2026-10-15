import type { GlazeBridge, RpcResult, WorkResourceUploadParams, WorkUpload } from "@glaze/contracts";

/** Pass a user-selected File to preload without exposing filesystem paths */
export async function uploadDroppedResource(
  file: File,
  params: WorkResourceUploadParams,
): Promise<RpcResult<WorkUpload>> {
  const bridge = (globalThis as typeof globalThis & { glaze?: GlazeBridge }).glaze;
  if (!bridge?.uploadDroppedResource)
    return { ok: false, error: { kind: "unavailable", message: "当前环境不支持拖入，请使用上传按钮" } };
  return bridge.uploadDroppedResource(file, params);
}
