import {
  AppLogo,
  avatarColorsFor,
  Button,
  Notice,
  PixelAvatar,
  TextArea,
  TextButton,
  useNavigation,
  useSession,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { routes } from "../routes";
import styles from "./Login.module.css";
import { LoginLayout } from "./LoginLayout";
import { LoginProgress } from "./LoginProgress";
import { cookieSteps, useLogin, windowSteps } from "./useLogin";

type Mode = "window" | "cookie";

/** Sign in through NetEase's official login window, or with a pasted cookie */
export function LoginPage() {
  const { params, navigate } = useNavigation();
  const { current } = useSession();
  const [mode, setMode] = useState<Mode>(params.mode === "cookie" ? "cookie" : "window");
  const [cookie, setCookie] = useState("");
  const { phase, error, loginWithWindow, loginWithCookie, cancel } = useLogin();
  const idle = phase.kind === "idle";

  return (
    <LoginLayout>
      <div className={styles.heading}>
        <AppLogo size={44} />
        <div className={styles.titles}>
          <h1 className={styles.title}>登录开发者账号</h1>
          <span className={styles.subtitle}>登录网易我的世界开发者平台账号以继续</span>
        </div>
      </div>

      <section aria-label="登录" className={styles.form}>
        {mode === "window" ? (
          <p className={styles.explain}>
            点击下方按钮会打开网易我的世界开发者平台的官方登录窗口。在那里完成登录（包括验证码和手机验证），本应用不会接触你的密码。
          </p>
        ) : (
          <>
            <TextArea
              id="login-cookie"
              label="Cookie"
              placeholder="粘贴完整的 Cookie 字符串，或只粘贴 NTES_SESS 的值"
              value={cookie}
              onChange={setCookie}
            />
            <span className={styles.warning}>
              <span className={styles.warningDot} aria-hidden="true" />
              Cookie 等同于登录凭据，请勿分享。登录前会先验证是否有效，保存时加密。
            </span>
          </>
        )}

        {error && <Notice>{error}</Notice>}

        {idle && (
          <>
            {mode === "window" ? (
              <Button variant="primary" size="lg" className={styles.submit} onClick={loginWithWindow}>
                打开网易登录窗口
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className={styles.submit}
                disabled={cookie.trim().length === 0}
                onClick={() => loginWithCookie(cookie)}
              >
                验证并登录
              </Button>
            )}
            <TextButton
              tone="subtle"
              className={styles.switchMode}
              onClick={() => setMode(mode === "window" ? "cookie" : "window")}
            >
              {mode === "window" ? "使用 Cookie 登录" : "使用网易账号登录"}
            </TextButton>
            {current && (
              <TextButton tone="subtle" className={styles.switchMode} onClick={() => navigate(routes.home)}>
                返回工作台
              </TextButton>
            )}
          </>
        )}

        {phase.kind === "working" && (
          <>
            <LoginProgress steps={mode === "window" ? windowSteps : cookieSteps} step={phase.step} />
            {phase.step === "window" && (
              <TextButton tone="subtle" className={styles.switchMode} onClick={cancel}>
                取消登录
              </TextButton>
            )}
          </>
        )}

        {phase.kind === "done" && (
          <div role="status" className={styles.done}>
            <div className={styles.welcome}>
              <PixelAvatar colors={avatarColorsFor(phase.account.id)} size={44} />
              <span className={styles.welcomeText}>
                <span className={styles.welcomeName}>欢迎，{phase.account.nickname}</span>
                <span className={styles.muted}>账号已加密保存，下次启动会自动登录</span>
              </span>
            </div>
            <Button variant="primary" size="lg" onClick={() => navigate(routes.home)}>
              进入工作台
            </Button>
          </div>
        )}
      </section>
    </LoginLayout>
  );
}
