import type { RpcMethod, RpcMethods } from "@glaze/contracts";
import { workOperationMethods } from "@glaze/contracts";
import { McpError } from "@glaze/mcp";
import {
  cancelPromotionDiscount,
  deleteMessages,
  getAnalyticsMonthly,
  getAnalyticsPeriodIncome,
  getAnalyticsRealtime,
  getMessage,
  getMessageUnreadCount,
  getWorksPage,
  joinPromotion,
  listComments,
  listFeedback,
  listMessages,
  markAllMessagesRead,
  type NeteaseSession,
  performWorkOperation,
  type Result,
  readFeedbackLog,
  replyComment,
  replyFeedback,
  savePromotionBanner,
  searchWorkReferences,
  searchWorks,
} from "@glaze/netease";
import type { SessionManager } from "../session/session-manager";

type Handler = (session: NeteaseSession, params: Record<string, unknown>) => Promise<Result<unknown>>;

/** Preserve the RPC parameter types while adapting endpoints to the MCP host dispatcher */
function bind<M extends RpcMethod>(
  method: M,
  run: (session: NeteaseSession, params: RpcMethods[M]["params"]) => Promise<Result<RpcMethods[M]["result"]>>,
): [string, Handler] {
  return [method, (session, params) => run(session, params as RpcMethods[M]["params"])];
}
const handlers = new Map<string, Handler>([
  bind("works.page", (s, p) => getWorksPage(s, p.page, p.pageSize)),
  bind("works.search", searchWorks),
  bind("works.searchReferences", searchWorkReferences),
  ...workOperationMethods.map((method) => bind(method, (s, p) => performWorkOperation(s, method, p))),
  bind("comments.list", listComments),
  bind("comments.reply", replyComment),
  bind("feedback.list", listFeedback),
  bind("feedback.reply", replyFeedback),
  bind("feedback.log", (_s, p) => readFeedbackLog(p.url)),
  bind("messages.list", listMessages),
  bind("messages.unreadCount", (s) => getMessageUnreadCount(s)),
  bind("messages.get", (s, p) => getMessage(s, p.id)),
  bind("messages.markAllRead", (s) => markAllMessagesRead(s)),
  bind("messages.delete", (s, p) => deleteMessages(s, p.ids)),
  bind("analytics.monthly", getAnalyticsMonthly),
  bind("analytics.periodIncome", getAnalyticsPeriodIncome),
  bind("analytics.realtime", getAnalyticsRealtime),
  bind("promotion.join", joinPromotion),
  bind("promotion.cancelDiscount", cancelPromotionDiscount),
  bind("promotion.saveBanner", savePromotionBanner),
]);

/** Inject fixed account sessions and write guards without synthesizing renderer IPC events */
export function createMcpBusiness(sessions: Pick<SessionManager, "request">) {
  return async (
    method: string,
    params: Record<string, unknown>,
    guard: () => void,
    beforeWrite: () => void,
  ): Promise<unknown> => {
    const handler = handlers.get(method);
    if (!handler) throw new McpError("unknown_tool", "业务方法未注册");
    guard();
    return sessions.request(params.account as string, async (session) => {
      const result = await handler(
        {
          ...session,
          beforeRequest: (httpMethod) => {
            guard();
            if (httpMethod !== "GET" || method === "messages.get") beforeWrite();
          },
        },
        params,
      );
      if (!result.ok && result.error.kind === "parse") throw new McpError("parse", "平台响应无法确认");
      return result;
    });
  };
}
