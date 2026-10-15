import {
  AppLogo,
  Button,
  Checkbox,
  PasswordField,
  PixelAvatar,
  TextArea,
  TextButton,
  TextField,
  useNavigation,
} from "@glaze/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { accounts } from "../mock";
import { routes } from "../routes";
import styles from "./Login.module.css";
import { LoginLayout } from "./LoginLayout";
import { LoginProgress, loginSteps } from "./LoginProgress";

type Mode = "email" | "cookie";
type Phase = "idle" | "loading" | "done";

// Mock timing per protocol step until the real login runs in the main process (M2)
const STEP_MS = 700;

/** First-run login with email + password or a pasted cookie */
export function LoginPage() {
  const { params, navigate } = useNavigation();
  const [mode, setMode] = useState<Mode>(params.mode === "cookie" ? "cookie" : "email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [cookie, setCookie] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  // Finish once every protocol step has passed
  useEffect(() => {
    if (phase === "loading" && step >= loginSteps.length) {
      window.clearInterval(timer.current);
      setPhase("done");
    }
  }, [phase, step]);

  const login = () => {
    setPhase("loading");
    setStep(0);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => setStep((current) => current + 1), STEP_MS);
  };

  // Mock: the account that the login resolves to
  const welcomed = accounts[0];

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
        {mode === "email" ? (
          <>
            <TextField
              id="login-email"
              label="邮箱"
              type="email"
              autoComplete="username"
              placeholder="开发者账号绑定的邮箱"
              value={email}
              onChange={setEmail}
            />
            <PasswordField
              id="login-password"
              label="密码"
              placeholder="账号密码"
              value={password}
              onChange={setPassword}
            />
            <Checkbox checked={remember} onChange={setRemember}>
              记住密码，加密保存在本机
            </Checkbox>
          </>
        ) : (
          <>
            <TextArea
              id="login-cookie"
              label="Cookie"
              placeholder="粘贴完整的 Cookie 字符串，或只粘贴目标 Cookie 的值"
              value={cookie}
              onChange={setCookie}
            />
            <span className={styles.warning}>
              <span className={styles.warningDot} aria-hidden="true" />
              Cookie 等同于登录凭据，请勿分享。登录前会先验证是否有效，保存时加密。
            </span>
          </>
        )}

        {phase === "idle" && (
          <>
            <Button variant="primary" size="lg" className={styles.submit} onClick={login}>
              登录
            </Button>
            <TextButton
              tone="subtle"
              className={styles.switchMode}
              onClick={() => setMode(mode === "email" ? "cookie" : "email")}
            >
              {mode === "email" ? "使用 Cookie 登录" : "使用邮箱登录"}
            </TextButton>
          </>
        )}

        {phase === "loading" && <LoginProgress step={step} />}

        {phase === "done" && welcomed && (
          <div role="status" className={styles.done}>
            <div className={styles.welcome}>
              <PixelAvatar colors={welcomed.avatar} size={44} />
              <span className={styles.welcomeText}>
                <span className={styles.welcomeName}>欢迎，{welcomed.nickname}</span>
                <span className={styles.muted}>
                  {remember ? "账号已保存，下次启动会自动登录" : "本次登录不会保存密码"}
                </span>
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
