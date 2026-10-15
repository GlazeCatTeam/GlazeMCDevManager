// Account and login capabilities. Credentials (cookies) never cross the IPC boundary

export type LoginMethod = "window" | "cookie";

/** active: session verified; expired: NetEase said not logged in; offline: last check failed on the network */
export type SessionStatus = "active" | "expired" | "offline";

export interface AccountSummary {
  /** Local account id; the NetEase developer API exposes no stable developer UID */
  id: string;
  nickname: string;
  /** NetEase passport account, e.g. "dev@163.com"; null when only a cookie was imported */
  passport: string | null;
  avatarUrl: string | null;
  loginMethod: LoginMethod;
  /** Epoch milliseconds of the last successful login or verification */
  lastLoginAt: number;
  status: SessionStatus;
  current: boolean;
}

export interface InitialRoute {
  route: string;
  params: Record<string, string>;
}

/** window: waiting for the user in the NetEase login window; verify: checking the session with the platform */
export type LoginStep = "window" | "verify";

/** Error kinds returned by account capabilities */
export type AccountErrorKind =
  | "login_cancelled"
  | "invalid_cookie"
  | "session_expired"
  | "network"
  | "timeout"
  | "business"
  | "not_found"
  | "busy";

export interface AccountChanged {
  current: AccountSummary | null;
  accounts: AccountSummary[];
}
