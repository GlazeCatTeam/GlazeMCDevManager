import { Notification } from "electron";

/** Keep the current native notification alive and isolate OS failures from session handling */
export class ExpiryNotification {
  private notification: Notification | null = null;

  constructor(
    private readonly showWindow: () => void,
    private readonly warn: (message: string) => void,
  ) {}

  /** Show a generic expiration reminder without placing account details in the notification center */
  show(): void {
    try {
      if (!Notification.isSupported()) {
        this.warn("系统不支持会话过期通知，请查看应用内登录状态");
        return;
      }
      this.notification?.close();
      const notification = new Notification({
        title: "登录已过期",
        body: "Glaze MC Dev Manager 的当前账号需要重新登录，点击返回应用。",
      });
      this.notification = notification;
      notification.on("click", this.showWindow);
      notification.on("failed", () => this.warn("会话过期系统通知发送失败，请查看应用内登录状态"));
      notification.show();
    } catch {
      this.warn("会话过期系统通知不可用，请查看应用内登录状态");
    }
  }
}
