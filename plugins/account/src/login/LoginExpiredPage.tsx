import {
  Avatar,
  avatarColorsFor,
  Button,
  callHost,
  Icon,
  Notice,
  remoteImageUrl,
  TextArea,
  TextButton,
  useNavigation,
  useSession,
} from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import { routes } from "../routes";
import styles from "./Login.module.css";
import expiredStyles from "./LoginExpiredPage.module.css";
import { LoginLayout } from "./LoginLayout";
import { LoginProgress } from "./LoginProgress";
import { cookieSteps, useLogin, windowSteps } from "./useLogin";

/** Re-login for an account whose session expired; params.id names the account */
export function LoginExpiredPage() {
  const { params, navigate } = useNavigation();
  const { accounts } = useSession();
  const [cookie, setCookie] = useState("");
  const [switchError, setSwitchError] = useState<string | null>(null);
  const { phase, error, loginWithWindow, loginWithCookie, cancel } = useLogin();
  const account = accounts.find((item) => item.id === params.id) ?? accounts.find((item) => item.current);

  // Back to the workbench once the re-login succeeds
  useEffect(() => {
    if (phase.kind === "done") {
      navigate(routes.home);
    }
  }, [phase, navigate]);

  // Nothing to re-login (e.g. the account was removed): fall back to a fresh login
  useEffect(() => {
    if (!account) {
      navigate(routes.login);
    }
  }, [account, navigate]);

  if (!account) {
    return null;
  }

  const byCookie = account.loginMethod === "cookie";
  const others = accounts.filter((item) => item.id !== account.id && item.status !== "expired");
  const subtitle = byCookie
    ? "Cookie 登录 · 请重新粘贴 Cookie"
    : `${account.passport ?? "网易账号"} · 请在网易登录窗口中重新登录`;

  /** Switch to another saved account; stays here and explains why if it fails */
  const switchTo = async (id: string) => {
    setSwitchError(null);
    const result = await callHost("account.switch", { id });
    if (result.ok) {
      navigate(routes.home);
    } else {
      setSwitchError(result.error.message);
    }
  };

  return (
    <LoginLayout>
      <div className={expiredStyles.heading}>
        <span className={expiredStyles.avatar}>
          <Avatar src={remoteImageUrl(account.avatarUrl)} colors={avatarColorsFor(account.id)} size={56} />
          <span className={expiredStyles.badge} aria-hidden="true" />
        </span>
        <div className={styles.titles}>
          <h1 className={styles.title}>{account.nickname}，登录已过期</h1>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
      </div>

      <section aria-label="重新登录" className={styles.form}>
        {byCookie && (
          <TextArea
            id="relogin-cookie"
            label="Cookie"
            placeholder="粘贴完整的 Cookie 字符串，或只粘贴 NTES_SESS 的值"
            value={cookie}
            onChange={setCookie}
          />
        )}
        {(error ?? switchError) && <Notice>{error ?? switchError}</Notice>}

        {phase.kind === "working" ? (
          <>
            <LoginProgress steps={byCookie ? cookieSteps : windowSteps} step={phase.step} />
            {phase.step === "window" && (
              <TextButton tone="subtle" className={styles.switchMode} onClick={cancel}>
                取消登录
              </TextButton>
            )}
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="lg"
              className={styles.submit}
              disabled={byCookie && cookie.trim().length === 0}
              onClick={byCookie ? () => loginWithCookie(cookie) : loginWithWindow}
            >
              {byCookie ? "验证并登录" : "打开网易登录窗口"}
            </Button>
            <div className={expiredStyles.alternatives}>
              {!byCookie && (
                <TextButton tone="subtle" onClick={() => navigate(routes.login, { mode: "cookie" })}>
                  使用 Cookie 登录
                </TextButton>
              )}
              <TextButton tone="subtle" onClick={() => navigate(routes.login)}>
                换个账号
              </TextButton>
            </div>
          </>
        )}
      </section>

      {others.length > 0 && (
        <section aria-label="其他已保存的账号" className={expiredStyles.others}>
          <span className={expiredStyles.othersTitle}>其他已保存的账号</span>
          {others.map((other) => (
            <button key={other.id} type="button" className={expiredStyles.other} onClick={() => switchTo(other.id)}>
              <Avatar src={remoteImageUrl(other.avatarUrl)} colors={avatarColorsFor(other.id)} size={36} />
              <span className={expiredStyles.otherText}>
                <span className={expiredStyles.otherName}>{other.nickname}</span>
                <span className={expiredStyles.valid}>
                  {other.status === "offline" ? "上次检查时离线" : "会话有效"}
                </span>
              </span>
              <span className={expiredStyles.use}>
                使用此账号
                <Icon name="action.chevronRight" size={12} />
              </span>
            </button>
          ))}
        </section>
      )}
    </LoginLayout>
  );
}
