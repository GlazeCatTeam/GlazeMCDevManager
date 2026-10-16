import { Notice, TextButton } from "@glaze/plugin-sdk";
import { useAction, useMcp } from "../useMcp";
import { ServiceSettings } from "../widgets/ServiceSettings";

/** Settings section contributed to the settings page: AI connection service and port */
export function AiServiceSection() {
  const { snapshot, error, reload } = useMcp();
  const action = useAction(reload);
  const message = error || action.message || snapshot?.error;
  return (
    <>
      {message && (
        <Notice action={error ? <TextButton onClick={() => void reload()}>重试</TextButton> : undefined}>
          {message}
        </Notice>
      )}
      {snapshot ? <ServiceSettings snapshot={snapshot} action={action} /> : <p>正在读取连接服务状态…</p>}
    </>
  );
}
