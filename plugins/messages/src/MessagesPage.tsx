import { Button, Dialog, TextButton } from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./MessagesPage.module.css";
import {
  createMessages,
  deleteMessages,
  filterMessages,
  type MessageType,
  markMessagesRead,
  messageTypes,
  type ReadFilter,
} from "./mock";

const typeStyles: Record<MessageType, string | undefined> = {
  系统通知: styles.system,
  重要通知: styles.important,
  审核通知: styles.review,
  问题反馈: styles.feedback,
  提醒: styles.reminder,
};

/** Message list and detail with local filtering, read state and confirmed deletion */
export function MessagesPage() {
  const [messages, setMessages] = useState(createMessages);
  const [selectedId, setSelectedId] = useState("notice-01");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<MessageType | "全部">("全部");
  const [status, setStatus] = useState<ReadFilter>("全部");
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const visible = filterMessages(messages, query, type, status);
  const selected = visible.find((message) => message.id === selectedId);
  const unreadCount = messages.filter((message) => !message.read).length;
  const readIds = messages.filter((message) => message.read).map((message) => message.id);

  /** Opening a detail marks only that message as read */
  function openMessage(id: string) {
    setSelectedId(id);
    setMessages((current) => markMessagesRead(current, [id]));
    if (status === "未读") {
      setStatus("全部");
      setNotice("已标记为已读，切换至全部消息");
    } else {
      setNotice("");
    }
  }

  /** Confirm the captured deletion scope without affecting later selection */
  function confirmDelete() {
    setMessages((current) => deleteMessages(current, pendingDelete));
    setNotice(`已从本地预览移除 ${pendingDelete.length} 条消息`);
    setPendingDelete([]);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>消息中心</h1>
          <span className={styles.subtitle}>
            共 {messages.length} 条消息 · 未读 {unreadCount} 条 · 模拟数据
          </span>
        </div>
        <div className={styles.toolbar}>
          <Button
            size="xs"
            disabled={unreadCount === 0}
            onClick={() => {
              setMessages((current) =>
                markMessagesRead(
                  current,
                  current.map((message) => message.id),
                ),
              );
              setNotice("已将全部消息标记为已读");
            }}
          >
            全部已读
          </Button>
          <Button size="xs" disabled={readIds.length === 0} onClick={() => setPendingDelete(readIds)}>
            删除已读
          </Button>
          <Button
            size="xs"
            onClick={() => setNotice(`预览数据已刷新 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`)}
          >
            刷新
          </Button>
        </div>
      </div>

      <section className={styles.filters} aria-label="消息筛选">
        <div className={styles.filterRow}>
          <input
            className={styles.search}
            aria-label="搜索消息标题"
            placeholder="搜索消息标题…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className={styles.statusFilter}>
            <span className={styles.label}>状态</span>
            {(["全部", "未读", "已读"] as const).map((item) => (
              <Button
                key={item}
                size="xs"
                variant={status === item ? "primary" : "secondary"}
                aria-pressed={status === item}
                onClick={() => setStatus(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
        <div className={styles.filterRow}>
          <span className={styles.label}>类型</span>
          {(["全部", ...messageTypes] as const).map((item) => {
            const count = messages.filter(
              (message) => !message.read && (item === "全部" || message.type === item),
            ).length;
            return (
              <Button
                key={item}
                size="xs"
                variant={type === item ? "primary" : "secondary"}
                aria-pressed={type === item}
                onClick={() => setType(item)}
              >
                {item}
                {item !== "全部" && count > 0 && <span className={styles.count}>{count}</span>}
              </Button>
            );
          })}
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.listPanel} aria-label="消息列表">
          <div className={styles.panelHeader}>
            <strong>消息列表</strong>
            <span className={styles.subtitle}>{visible.length} 条</span>
          </div>
          <div className={styles.list}>
            {visible.length === 0 && <div className={styles.empty}>没有符合条件的消息</div>}
            {visible.map((message) => (
              <button
                type="button"
                key={message.id}
                className={`${styles.item} ${message.id === selected?.id ? styles.selected : ""}`}
                aria-pressed={message.id === selected?.id}
                onClick={() => openMessage(message.id)}
              >
                <span className={`${styles.itemTitle} ${!message.read ? styles.unread : ""}`}>
                  <span className={message.read ? styles.readDot : styles.unreadDot} />
                  {message.title}
                </span>
                <span className={styles.itemMeta}>
                  <span className={`${styles.badge} ${typeStyles[message.type]}`}>{message.type}</span>
                  <time>{message.sentAt}</time>
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className={styles.detailPanel} aria-label="消息详情">
          {selected ? (
            <>
              <div className={styles.detailScroll}>
                <div className={styles.detailMeta}>
                  <span className={`${styles.badge} ${typeStyles[selected.type]}`}>{selected.type}</span>
                  <time>{selected.sentAt}</time>
                </div>
                <h2 className={styles.detailTitle}>{selected.title}</h2>
                <span className={styles.subtitle}>发送方：{selected.sender}</span>
                <div className={styles.body}>
                  {selected.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {selected.info.length > 0 && (
                  <dl className={styles.info}>
                    {selected.info.map((item) => (
                      <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <div className={styles.detailFooter}>
                <span className={styles.subtitle}>打开消息即标记为已读</span>
                <TextButton tone="danger" onClick={() => setPendingDelete([selected.id])}>
                  删除该消息
                </TextButton>
              </div>
            </>
          ) : (
            <div className={styles.empty}>选择一条消息查看详情</div>
          )}
        </section>
      </div>
      <div className={styles.notice} role="status">
        {notice}
      </div>
      {pendingDelete.length > 0 && (
        <Dialog
          title="删除消息"
          onClose={() => setPendingDelete([])}
          actions={
            <>
              <Button onClick={() => setPendingDelete([])}>取消</Button>
              <Button variant="danger" onClick={confirmDelete}>
                确认删除
              </Button>
            </>
          }
        >
          将从当前本地预览中删除 {pendingDelete.length} 条消息，此操作不可撤销。
        </Dialog>
      )}
    </div>
  );
}
