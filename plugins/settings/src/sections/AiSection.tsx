import { Button, EmptyState, Switch, TextButton } from "@glaze/plugin-sdk";
import type { PairedClient } from "../mock";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import styles from "./AiSection.module.css";
import sections from "./Sections.module.css";

export interface AiSectionProps {
  clients: PairedClient[];
  onRevoke: (client: PairedClient) => void;
  /** Report an action that needs a service which is not connected yet */
  onUnavailable: (message: string) => void;
}

/** MCP service switch, client pairing, paired clients and the permission rules */
export function AiSection({ clients, onRevoke, onUnavailable }: AiSectionProps) {
  return (
    <div className={sections.stack}>
      <SettingGroup title="连接服务">
        <SettingRow title="MCP 服务" description="尚未接入主进程，当前未启动服务">
          <Switch
            label="MCP 服务"
            checked={false}
            onChange={() => onUnavailable("MCP 服务尚未实现，无法启动或生成有效配对码。下方客户端仅为模拟数据。")}
          />
        </SettingRow>
        <SettingRow title="客户端配对" description="服务开启后生成一次性配对码">
          <Button size="xs" onClick={() => onUnavailable("配对服务尚未接入，暂时无法生成配对码。")}>
            生成配对码
          </Button>
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="已配对客户端" note={`模拟数据 · ${clients.length}`}>
        {clients.map((client) => (
          <SettingRow key={client.id} title={client.name} description={`最近连接 ${client.lastSeen} · 只读权限`}>
            <TextButton tone="danger" onClick={() => onRevoke(client)}>
              撤销授权
            </TextButton>
          </SettingRow>
        ))}
        {clients.length === 0 && <EmptyState title="暂无已配对客户端" />}
      </SettingGroup>
      <section className={styles.permissions} aria-label="权限说明">
        <h3>权限说明</h3>
        <ul>
          <li>默认只读，仅允许查询授权范围内的数据</li>
          <li>写操作每次都需要在应用内确认</li>
          <li>密码、Cookie 和登录凭据永不向 AI 工具开放</li>
        </ul>
      </section>
    </div>
  );
}
