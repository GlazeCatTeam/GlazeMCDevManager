import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** Protect bridge credentials with Windows DPAPI directly, independently of Chromium profile keys */
export function bridgeCredential(value: string, decrypt: boolean): string {
  if (process.platform !== "win32") throw new Error("MCP 本机凭证仅支持 Windows");
  const operation = decrypt
    ? "[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($value), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))"
    : "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($value), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))";
  const command = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Security; $value = [Console]::In.ReadToEnd(); [Console]::Out.Write(${operation})`;
  const result = spawnSync(
    join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { input: value, encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024 },
  );
  if (result.status !== 0 || result.error || !result.stdout)
    throw new Error("Windows 用户凭证保护不可用，未建立 MCP 连接");
  return result.stdout.trim();
}
