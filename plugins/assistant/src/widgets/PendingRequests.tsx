import {
  Button,
  callHost,
  type McpAccessRequest,
  type McpDecision,
  mcpLevels,
  mcpPermissionLabels,
  Panel,
  Tag,
} from "@glaze/plugin-sdk";
import { unwrap, type useAction } from "../useMcp";
import styles from "./PendingRequests.module.css";

/** Requests the user closed in the popup stay answerable here until they expire */
export function PendingRequests({
  requests,
  action,
}: {
  requests: McpAccessRequest[];
  action: ReturnType<typeof useAction>;
}) {
  if (!requests.length) return null;
  /** Send the decision for one waiting request */
  const answer = (request: McpAccessRequest, decision: McpDecision) =>
    action.run(async () => {
      unwrap(await callHost("mcp.answer", { requestId: request.id, decision }));
    });
  return (
    <Panel title="等你允许" badge={<Tag tone="warning">{requests.length}</Tag>} aria-label="等你允许">
      <div className={styles.list}>
        {requests.map((request) => (
          <div key={request.id} className={styles.row}>
            <div className={styles.text}>
              <b>
                {request.clientName}
                {request.kind === "connect"
                  ? ` 想连接 Glaze（${mcpLevels.assist.title}）`
                  : `：${request.permissions.map((p) => mcpPermissionLabels[p]).join("、")}`}
              </b>
              <span>「{request.reason}」</span>
            </div>
            <div className={styles.actions}>
              <Button size="sm" disabled={action.busy} onClick={() => void answer(request, "deny")}>
                拒绝
              </Button>
              {request.kind === "permission" && (
                <Button size="sm" disabled={action.busy} onClick={() => void answer(request, "once")}>
                  仅这一次
                </Button>
              )}
              <Button size="sm" variant="primary" disabled={action.busy} onClick={() => void answer(request, "always")}>
                {request.kind === "connect" ? "允许连接" : "一直允许"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
