import {
  Button,
  Checkbox,
  Icon,
  PasswordField,
  PixelAvatar,
  TextArea,
  TextButton,
  useNavigation,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { accounts, initialCurrentUid } from "../mock";
import { routes } from "../routes";
import styles from "./Login.module.css";
import expiredStyles from "./LoginExpiredPage.module.css";
import { LoginLayout } from "./LoginLayout";

/** Re-login for an account whose session expired; params.uid names the account */
export function LoginExpiredPage() {
  const { params, navigate } = useNavigation();
  const [password, setPassword] = useState("");
  const [cookie, setCookie] = useState("");
  const [remember, setRemember] = useState(true);

  const uid = params.uid ?? initialCurrentUid;
  const account = accounts.find((a) => a.uid === uid) ?? accounts[0];
  if (!account) {
    return null;
  }
  const others = accounts.filter((a) => a.uid !== account.uid && a.sessionValid);
  const byCookie = account.loginMethod === "cookie";
  const subtitle = byCookie
    ? "Cookie 登录 · 请重新粘贴 Cookie"
    : `${account.email ?? `UID ${account.uid}`} · 请重新输入密码`;

  return (
    <LoginLayout>
      <div className={expiredStyles.heading}>
        <span className={expiredStyles.avatar}>
          <PixelAvatar colors={account.avatar} size={56} />
          <span className={expiredStyles.badge} aria-hidden="true" />
        </span>
        <div className={styles.titles}>
          <h1 className={styles.title}>{account.nickname}，登录已过期</h1>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
      </div>

      <section aria-label="重新登录" className={styles.form}>
        {byCookie ? (
          <TextArea
            id="relogin-cookie"
            label="Cookie"
            placeholder="粘贴完整的 Cookie 字符串，或只粘贴目标 Cookie 的值"
            value={cookie}
            onChange={setCookie}
          />
        ) : (
          <>
            <PasswordField
              id="relogin-password"
              label="密码"
              placeholder="账号密码"
              value={password}
              onChange={setPassword}
            />
            <Checkbox checked={remember} onChange={setRemember}>
              记住密码，加密保存在本机
            </Checkbox>
          </>
        )}
        {/* Mock: the real re-login verifies in the main process before returning to the workbench */}
        <Button variant="primary" size="lg" className={styles.submit} onClick={() => navigate(routes.account)}>
          重新登录
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
      </section>

      {others.length > 0 && (
        <section aria-label="其他已保存的账号" className={expiredStyles.others}>
          <span className={expiredStyles.othersTitle}>其他已保存的账号</span>
          {others.map((other) => (
            <button key={other.uid} type="button" className={expiredStyles.other} onClick={() => navigate(routes.home)}>
              <PixelAvatar colors={other.avatar} size={36} />
              <span className={expiredStyles.otherText}>
                <span className={expiredStyles.otherName}>{other.nickname}</span>
                <span className={expiredStyles.valid}>会话有效</span>
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
