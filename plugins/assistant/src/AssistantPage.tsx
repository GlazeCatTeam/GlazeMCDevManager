import { Button, Notice, PageHeader, Panel, Tag, TextButton, useNavigation } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./AssistantPage.module.css";
import { examples } from "./examples";
import { useAction, useMcp } from "./useMcp";
import { ActivityPanel } from "./widgets/ActivityPanel";
import { ClientCard } from "./widgets/ClientCard";
import { ConnectDialog } from "./widgets/ConnectDialog";
import { PendingRequests } from "./widgets/PendingRequests";

/** AI-first entry: connect a tool with one click, then let the AI ask for anything else */
export function AssistantPage() {
  const { navigate } = useNavigation();
  const { snapshot, accounts, error, reload } = useMcp();
  const action = useAction(reload);
  const [connecting, setConnecting] = useState(false);
  const clients = snapshot?.clients ?? [];
  const online = clients.filter((client) => client.connected).length;
  const subtitle = !snapshot
    ? "正在读取…"
    : clients.length
      ? `${clients.length} 个 AI 工具 · ${online} 个正在使用`
      : "让 Claude Code、Codex、Cursor 等 AI 帮你管理作品、数据和玩家";

  return (
    <div className={styles.page}>
      <PageHeader
        title="AI 助手"
        subtitle={subtitle}
        actions={
          <Button variant="primary" disabled={!snapshot} onClick={() => setConnecting(true)}>
            连接 AI 工具
          </Button>
        }
      />
      {(error || action.message || snapshot?.error) && (
        <Notice action={error ? <TextButton onClick={() => void reload()}>重试</TextButton> : undefined}>
          {error || action.message || snapshot?.error}
        </Notice>
      )}

      {snapshot && <PendingRequests requests={snapshot.requests} action={action} />}

      {snapshot && !clients.length ? (
        <Panel className={styles.hero} aria-label="开始使用">
          <div className={styles.heroText}>
            <h2>三步让 AI 帮你干活</h2>
            <ol className={styles.steps}>
              <li>
                <b>选择你在用的 AI 工具</b>
                <span>Glaze 会自动帮它写好连接配置，不用自己改文件</span>
              </li>
              <li>
                <b>重启这个 AI 工具</b>
                <span>重启后它就能看到你的作品、数据和玩家评论</span>
              </li>
              <li>
                <b>用中文告诉它你想做什么</b>
                <span>需要更多权限时，Glaze 会弹窗问你，点「允许」即可</span>
              </li>
            </ol>
            <Button variant="primary" size="lg" onClick={() => setConnecting(true)}>
              连接我的 AI 工具
            </Button>
          </div>
          <Examples />
        </Panel>
      ) : (
        snapshot && (
          <Panel title="AI 工具" badge={<Tag>{clients.length}</Tag>} className={styles.clients} aria-label="AI 工具">
            <div className={styles.clientList}>
              {clients.map((client) => (
                <ClientCard key={client.id} client={client} accounts={accounts} action={action} />
              ))}
            </div>
          </Panel>
        )
      )}

      {snapshot && (
        <div className={styles.columns}>
          <ActivityPanel snapshot={snapshot} accounts={accounts} action={action} />
          {clients.length ? (
            <Panel title="试着这样对 AI 说" className={styles.side} aria-label="使用示例">
              <Examples />
            </Panel>
          ) : null}
        </div>
      )}

      <p className={styles.footnote}>
        连接服务开关、本机端口等高级选项在
        <TextButton onClick={() => navigate("glaze.settings/settings", { category: "glaze.assistant/ai-service" })}>
          设置 → AI 连接服务
        </TextButton>
      </p>

      <p className={styles.footnote}>
        AI 只能使用你允许的账号和权限；获得权限后直接执行，不再逐次确认。网易登录密码和 Cookie 永远不会交给 AI。
      </p>

      {connecting && (
        <ConnectDialog
          clients={clients}
          onClose={() => {
            setConnecting(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

/** Copyable sentences that show novices what to ask */
function Examples() {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <ul className={styles.examples} aria-label="示例">
      {examples.map((text) => (
        <li key={text}>
          <span>「{text}」</span>
          <TextButton
            tone="subtle"
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => setCopied(text))
                .catch(() => setCopied(null));
            }}
          >
            {copied === text ? "已复制" : "复制"}
          </TextButton>
        </li>
      ))}
    </ul>
  );
}
