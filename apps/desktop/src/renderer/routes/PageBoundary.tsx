import { Button, callHost, EmptyState } from "@glaze/plugin-sdk";
import { Component, type ReactNode } from "react";

/** Keep a failed optional module from taking down navigation or settings */
export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  /** Show a recovery action when a lazy module or page cannot render */
  static getDerivedStateFromError() {
    return { failed: true };
  }
  /** Report only the failure category; component props and error messages may contain private data */
  override componentDidCatch() {
    void callHost("app.reportRendererError", { kind: "error" }).catch(() => {});
  }
  /** Keep the rest of the shell mounted while the failed page is unavailable */
  override render() {
    return this.state.failed ? (
      <div>
        <EmptyState title="页面加载失败" hint="可切换到其他页面，或重新加载应用后重试" />
        <Button onClick={() => window.location.reload()}>重新加载应用</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
