import {
  Button,
  Chip,
  Dialog,
  EmptyState,
  type MessageType,
  messageTypes,
  PageHeader,
  SearchField,
  SegmentedControl,
  useSession,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { messageLabels } from "./data";
import styles from "./MessagesPage.module.css";
import { useMessages } from "./useMessages";
import { MessageDetail } from "./widgets/MessageDetail";
import { MessageList } from "./widgets/MessageList";

const readFilters = [
  { value: "全部", label: "全部" },
  { value: "未读", label: "未读" },
  { value: "已读", label: "已读" },
] as const;

/** Remount on account changes so data, pending confirmations and requests stay isolated */
export function MessagesPage() {
  const { current } = useSession();
  if (!current)
    return (
      <div className={styles.page}>
        <PageHeader title="消息中心" />
        <EmptyState title="请先登录账号" hint="登录后查看网易开发者平台消息" />
      </div>
    );
  return <AccountMessages key={current.id} account={current.id} />;
}

/** Account mailbox with server filters, pagination and explicit deletion confirmation */
function AccountMessages({ account }: { account: string }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<MessageType | "全部">("全部");
  const [status, setStatus] = useState<"全部" | "未读" | "已读">("全部");
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const mailbox = useMessages(account, {
    title: query,
    ...(type === "全部" ? {} : { type }),
    ...(status === "全部" ? {} : { read: status === "已读" }),
  });
  const messages = mailbox.page?.messages ?? [];
  const readIds = messages.filter((message) => message.read).map((message) => message.id);
  const disabled = mailbox.busy || mailbox.loading;

  /** Keep the captured IDs available for retry until the host confirms deletion */
  const confirmDelete = async () => {
    if (await mailbox.mutate(pendingDelete)) setPendingDelete([]);
  };

  /** Dismiss a confirmation only when no deletion is in flight */
  const cancelDelete = () => {
    if (!mailbox.busy) setPendingDelete([]);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="消息中心"
        subtitle={
          mailbox.page
            ? `符合筛选 ${mailbox.page.total} 条 · 未读 ${mailbox.page.unread ?? "—"} 条`
            : "网易开发者平台消息"
        }
        actions={
          <>
            <Button
              disabled={disabled || !mailbox.page || mailbox.page.unread === 0}
              onClick={() => void mailbox.mutate()}
            >
              全部已读
            </Button>
            <Button disabled={disabled || readIds.length === 0} onClick={() => setPendingDelete(readIds)}>
              删除已读
            </Button>
            <Button disabled={disabled} onClick={() => void mailbox.load()}>
              刷新
            </Button>
          </>
        }
      />
      <fieldset className={styles.filters} aria-label="消息筛选" disabled={mailbox.busy || pendingDelete.length > 0}>
        <div className={styles.filterRow}>
          <SearchField value={query} onChange={(value) => setQuery(value.slice(0, 200))} placeholder="搜索消息标题…" />
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>状态</span>
            <SegmentedControl label="阅读状态" options={readFilters} value={status} onChange={setStatus} />
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>类型</span>
          <Chip selected={type === "全部"} onClick={() => setType("全部")}>
            全部
          </Chip>
          {messageTypes.map((item) => (
            <Chip
              key={item}
              selected={type === item}
              count={mailbox.page?.unreadByType[item] ?? undefined}
              onClick={() => setType(item)}
            >
              {messageLabels[item]}
            </Chip>
          ))}
        </div>
      </fieldset>
      {mailbox.error && (
        <div role="alert">
          {mailbox.error}{" "}
          <Button disabled={disabled} onClick={() => void mailbox.load()}>
            重新加载
          </Button>
        </div>
      )}
      <div className={styles.columns}>
        <MessageList
          messages={messages}
          selectedId={mailbox.selected?.id}
          onOpen={(id) => void mailbox.open(id)}
          loading={mailbox.loading}
          failed={!!mailbox.error}
          disabled={disabled}
          hasMore={mailbox.hasMore}
          onLoadMore={() => void mailbox.load(true)}
        />
        <MessageDetail
          message={mailbox.selected}
          content={mailbox.content}
          loading={mailbox.detailLoading}
          error={mailbox.detailError}
          disabled={disabled}
          onRetry={() => mailbox.selected && void mailbox.open(mailbox.selected.id)}
          onDelete={(id) => setPendingDelete([id])}
        />
      </div>
      <div className={styles.notice} role="status">
        {mailbox.notice}
      </div>
      {pendingDelete.length > 0 && (
        <Dialog
          title="删除消息"
          onClose={cancelDelete}
          actions={
            <>
              <Button disabled={mailbox.busy} onClick={cancelDelete}>
                取消
              </Button>
              <Button disabled={disabled} variant="danger" onClick={() => void confirmDelete()}>
                {mailbox.busy ? "正在删除…" : "确认删除"}
              </Button>
            </>
          }
        >
          将从网易平台永久删除本次选中的 {pendingDelete.length}{" "}
          条消息。批量删除仅包含当前已加载列表中的已读消息，此操作不可撤销。
          {mailbox.error && <p role="alert">{mailbox.error}</p>}
        </Dialog>
      )}
    </div>
  );
}
