import { definePlugin } from "@glaze/plugin-sdk";
import { AccountPage } from "./AccountPage";
import { LoginExpiredPage } from "./login/LoginExpiredPage";
import { LoginPage } from "./login/LoginPage";

export { AccountPage, LoginExpiredPage, LoginPage };

export default definePlugin({
  pages: { account: AccountPage, login: LoginPage, "login-expired": LoginExpiredPage },
});
