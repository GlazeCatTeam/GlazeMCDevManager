import { Button, Panel, useNavigation } from "@glaze/plugin-sdk";
import { useMcp } from "../useMcp";
import styles from "./StatusWidget.module.css";

/** Home widget: AI connection state at a glance with a shortcut to the assistant page */
export function StatusWidget() {
  const { navigate } = useNavigation();
  const { snapshot } = useMcp();
  const clients = snapshot?.clients ?? [];
  const online = clients.filter((client) => client.connected).length;
  const waiting = snapshot?.requests.length ?? 0;
  const text = !snapshot
    ? "正在读取…"
    : waiting
      ? `有 ${waiting} 条 AI 请求等你允许`
      : clients.length
        ? `${clients.length} 个 AI 工具已连接，${online} 个正在使用`
        : "还没有连接 AI 工具，连上后可以用中文让 AI 帮你查数据、回评论";
  return (
    <Panel title="AI 助手" className={styles.panel}>
      <p className={waiting ? styles.waiting : styles.text}>{text}</p>
      <Button
        variant={waiting || !clients.length ? "primary" : "secondary"}
        onClick={() => navigate("glaze.assistant/assistant")}
      >
        {waiting ? "去处理" : clients.length ? "打开 AI 助手" : "连接 AI 工具"}
      </Button>
    </Panel>
  );
}
