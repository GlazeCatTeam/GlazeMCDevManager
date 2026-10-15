import { randomUUID } from "node:crypto";
import type { AccountChanged, AccountSummary, InitialRoute, LoginMethod, LoginStep } from "@glaze/contracts";
import { getUserInfo, type NeteaseSession, type Result, sessionCookieFromInput, type UserInfo } from "@glaze/netease";
import type { AccountRecord, AccountStore, Vault } from "@glaze/storage";
import { CapabilityError, fromNeteaseError } from "../ipc/errors";

const routes = {
  home: "glaze.home/home",
  login: "glaze.account/login",
  loginExpired: "glaze.account/login-expired",
};

export interface SessionEvents {
  changed: (payload: AccountChanged) => void;
  progress: (step: LoginStep) => void;
}

/**
 * Owns accounts and their sessions in the main process. Session cookies live in memory and,
 * encrypted, in the vault; they never leave this process. Logins and switches run one at a time
 */
export class SessionManager {
  private readonly sessions = new Map<string, string>();
  private busy = false;

  constructor(
    private readonly accounts: AccountStore,
    private readonly vault: Vault,
    private readonly events: SessionEvents,
  ) {}

  /** All saved accounts for the UI; never includes credentials */
  list(): AccountSummary[] {
    return this.accounts.list().map(toSummary);
  }

  /** The current account, or null when none is selected */
  current(): AccountSummary | null {
    const record = this.accounts.list().find((account) => account.current);
    return record ? toSummary(record) : null;
  }

  /** First page from saved state only, so the window opens without waiting for the network */
  initialRoute(): InitialRoute {
    const current = this.current();
    if (!current || !this.sessionOf(current.id)) {
      return { route: routes.login, params: {} };
    }
    if (current.status === "expired") {
      return { route: routes.loginExpired, params: { id: current.id } };
    }
    return { route: routes.home, params: {} };
  }

  /** Re-check the current account in the background after launch; expiry is pushed as an event */
  async restore(): Promise<void> {
    const current = this.current();
    if (current && this.sessionOf(current.id) && current.status !== "expired") {
      await this.check(current.id).catch(() => undefined);
    }
  }

  /** Sign in through NetEase's own login window; `openWindow` resolves with the captured session */
  async loginWithWindow(
    openWindow: () => Promise<{ sessionCookie: string; passport: string | null }>,
  ): Promise<AccountSummary> {
    return this.exclusive(async () => {
      this.events.progress("window");
      const login = await openWindow();
      this.events.progress("verify");
      return this.completeLogin(login.sessionCookie, login.passport, "window");
    });
  }

  /** Sign in with a pasted cookie string or bare NTES_SESS value; verified before it is saved */
  async loginWithCookie(input: string): Promise<AccountSummary> {
    return this.exclusive(async () => {
      const sessionCookie = sessionCookieFromInput(input);
      if (!sessionCookie) {
        throw new CapabilityError("invalid_cookie", "没有找到 NTES_SESS，请粘贴完整的 Cookie 或它的值");
      }
      this.events.progress("verify");
      try {
        return await this.completeLogin(sessionCookie, null, "cookie");
      } catch (error) {
        if (error instanceof CapabilityError && error.kind === "session_expired") {
          throw new CapabilityError("invalid_cookie", "这个 Cookie 无效或已过期");
        }
        throw error;
      }
    });
  }

  /** Verify the current account's session now */
  async verify(): Promise<AccountSummary> {
    const current = this.current();
    if (!current) {
      throw new CapabilityError("not_found", "当前没有登录的账号");
    }
    return this.check(current.id);
  }

  /** Switch to a saved account after verifying it; on failure the current account stays */
  async switchTo(id: string): Promise<AccountSummary> {
    return this.exclusive(async () => {
      const summary = await this.check(id);
      this.accounts.setCurrent(id);
      this.emit();
      return { ...summary, current: true };
    });
  }

  /** Sign out of the current account: forget its session but keep it in the saved list */
  logout(): void {
    const current = this.current();
    if (!current) {
      return;
    }
    this.sessions.delete(current.id);
    this.vault.deleteSession(current.id);
    this.accounts.setStatus(current.id, "expired");
    this.accounts.setCurrent(null);
    this.emit();
  }

  /** Delete a saved account and its session */
  remove(id: string): void {
    if (!this.accounts.get(id)) {
      throw new CapabilityError("not_found", "账号不存在");
    }
    this.sessions.delete(id);
    this.accounts.remove(id);
    this.emit();
  }

  /**
   * Run a platform request with an account's session (default: the current account) without
   * switching accounts. Rotated cookies are stored; expiry and network failures update the status
   */
  async request<T>(accountId: string | undefined, call: (session: NeteaseSession) => Promise<Result<T>>): Promise<T> {
    const id = accountId ?? this.current()?.id;
    const record = id ? this.accounts.get(id) : undefined;
    if (!id || !record) {
      throw new CapabilityError("not_found", accountId ? "账号不存在" : "当前没有登录的账号");
    }
    const sessionCookie = this.sessionOf(id);
    if (!sessionCookie) {
      this.markStatus(record, "expired");
      throw new CapabilityError("session_expired", "登录已过期，请重新登录");
    }
    const result = await call({ sessionCookie, onRenewed: (renewed) => this.storeSession(id, renewed) });
    const latest = this.accounts.get(id);
    if (!result.ok) {
      if (latest && result.error.kind !== "business" && result.error.kind !== "parse") {
        this.markStatus(latest, result.error.kind === "session_expired" ? "expired" : "offline");
      }
      throw fromNeteaseError(result.error);
    }
    if (latest?.status === "offline") {
      this.markStatus(latest, "active");
    }
    return result.value;
  }

  /** Session cookie of an account from memory, falling back to the vault */
  private sessionOf(id: string): string | null {
    const cached = this.sessions.get(id);
    if (cached) {
      return cached;
    }
    const stored = this.vault.loadSession(id);
    if (stored) {
      this.sessions.set(id, stored);
    }
    return stored;
  }

  /** Ask NetEase whether an account's session is still valid and record the answer */
  private async check(id: string): Promise<AccountSummary> {
    const record = this.accounts.get(id);
    if (!record) {
      throw new CapabilityError("not_found", "账号不存在");
    }
    const sessionCookie = this.sessionOf(id);
    if (!sessionCookie) {
      this.markStatus(record, "expired");
      throw new CapabilityError("session_expired", "登录已过期，请重新登录");
    }
    const result = await getUserInfo({ sessionCookie });
    if (!result.ok) {
      // Only NetEase saying "not logged in" expires a session; network trouble just marks it offline
      const status = result.error.kind === "session_expired" ? "expired" : "offline";
      this.markStatus(record, status);
      throw fromNeteaseError(result.error);
    }
    this.storeSession(id, result.value.renewedSessionCookie ?? sessionCookie);
    const updated: AccountRecord = {
      ...record,
      ...applyProfile(result.value.data, record.avatarUrl),
      status: "active",
      lastLoginAt: Date.now(),
    };
    this.accounts.save(updated);
    this.emit();
    return toSummary(updated);
  }

  /** Verify a fresh session, then save it under an existing or new account and make it current */
  private async completeLogin(
    sessionCookie: string,
    passport: string | null,
    loginMethod: LoginMethod,
  ): Promise<AccountSummary> {
    const result = await getUserInfo({ sessionCookie });
    if (!result.ok) {
      throw fromNeteaseError(result.error);
    }
    const profile = result.value.data;
    const existing = this.findExisting(passport, profile.nickname);
    const record: AccountRecord = {
      id: existing?.id ?? randomUUID(),
      ...applyProfile(profile, existing?.avatarUrl ?? null),
      passport: passport ?? existing?.passport ?? null,
      loginMethod,
      lastLoginAt: Date.now(),
      status: "active",
      current: true,
    };
    this.accounts.save(record);
    this.storeSession(record.id, result.value.renewedSessionCookie ?? sessionCookie);
    this.accounts.setCurrent(record.id);
    this.emit();
    return toSummary(record);
  }

  /**
   * The saved account a new login belongs to. The developer API has no stable UID, so accounts are
   * matched by passport name when known, otherwise by nickname
   */
  private findExisting(passport: string | null, nickname: string): AccountRecord | undefined {
    const all = this.accounts.list();
    if (passport) {
      return all.find((account) => account.passport === passport);
    }
    return all.find((account) => account.nickname === nickname);
  }

  /** Keep a session in memory and encrypted on disk */
  private storeSession(id: string, sessionCookie: string): void {
    this.sessions.set(id, sessionCookie);
    this.vault.saveSession(id, sessionCookie);
  }

  /** Record a status change and notify the UI only when it changed */
  private markStatus(record: AccountRecord, status: AccountRecord["status"]): void {
    if (record.status !== status) {
      this.accounts.setStatus(record.id, status);
      this.emit();
    }
  }

  /** Run one login or switch at a time */
  private async exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new CapabilityError("busy", "正在登录或切换账号，请稍候");
    }
    this.busy = true;
    try {
      return await task();
    } finally {
      this.busy = false;
    }
  }

  /** Push the current account list to the UI */
  private emit(): void {
    this.events.changed({ current: this.current(), accounts: this.list() });
  }
}

/** Account fields that come from /users/me; keeps the previous avatar when NetEase sends none */
function applyProfile(profile: UserInfo, previousAvatar: string | null): Pick<AccountRecord, "nickname" | "avatarUrl"> {
  return { nickname: profile.nickname, avatarUrl: profile.avatarUrl ?? previousAvatar };
}

/** Account record as sent to the UI */
function toSummary(record: AccountRecord): AccountSummary {
  return { ...record };
}
