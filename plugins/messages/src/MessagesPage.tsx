import { Button, Chip, Dialog, PageHeader, SearchField, SegmentedControl } from "@glaze/plugin-sdk";
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
import { MessageDetail } from "./widgets/MessageDetail";
import { MessageList } from "./widgets/MessageList";

const readFilters = [
  { value: "全部", label: "全部" },
  { value: "未读", label: "未读" },
  { value: "已读", label: "已读" },
] as const;

/** Current time for the refresh note, e.g. "14:20:05" */
function nowText(): string {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

/** Message center: filters on top, list on the left, detail on the right; deleting asks first */
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
  const unread = messages.filter((message) => !message.read);
  const readIds = messages.filter((message) => message.read).map((message) => message.id);

  /** Unread count of one type chip; "全部" counts every type */
  const unreadOf = (item: MessageType | "全部") =>
    unread.filter((message) => item === "全部" || message.type === item).length;

  /** Open a message and mark only that one as read; leave the "未读" filter so it stays visible */
  const openMessage = (id: string) => {
    setSelectedId(id);
    setMessages((current) => markMessagesRead(current, [id]));
    if (status === "未读") {
      setStatus("全部");
      setNotice("已标记为已读，切换至全部消息");
    } else {
      setNotice("");
    }
  };

  /** Mark every message as read */
  const markAllRead = () => {
    setMessages((current) =>
      markMessagesRead(
        current,
        current.map((message) => message.id),
      ),
    );
    setNotice("已将全部消息标记为已读");
  };

  /** Delete the messages captured when the dialog opened */
  const confirmDelete = () => {
    setMessages((current) => deleteMessages(current, pendingDelete));
    setNotice(`已从本地预览移除 ${pendingDelete.length} 条消息`);
    setPendingDelete([]);
  };

  const cancelDelete = () => setPendingDelete([]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="消息中心"
        subtitle={`共 ${messages.length} 条消息 · 未读 ${unread.length} 条 · 模拟数据`}
        actions={
          <>
            <Button disabled={unread.length === 0} onClick={markAllRead}>
              全部已读
            </Button>
            <Button disabled={readIds.length === 0} onClick={() => setPendingDelete(readIds)}>
              删除已读
            </Button>
            <Button onClick={() => setNotice(`预览数据已刷新 · ${nowText()}`)}>刷新</Button>
          </>
        }
      />

      <section className={styles.filters} aria-label="消息筛选">
        <div className={styles.filterRow}>
          <SearchField value={query} onChange={setQuery} placeholder="搜索消息标题…" />
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>状态</span>
            <SegmentedControl label="阅读状态" options={readFilters} value={status} onChange={setStatus} />
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>类型</span>
          {(["全部", ...messageTypes] as const).map((item) => (
            <Chip
              key={item}
              selected={type === item}
              count={item === "全部" ? undefined : unreadOf(item)}
              onClick={() => setType(item)}
            >
              {item}
            </Chip>
          ))}
        </div>
      </section>

      <div className={styles.columns}>
        <MessageList messages={visible} selectedId={selected?.id} onOpen={openMessage} />
        <MessageDetail message={selected} onDelete={(id) => setPendingDelete([id])} />
      </div>
      <div className={styles.notice} role="status">
        {notice}
      </div>

      {pendingDelete.length > 0 && (
        <Dialog
          title="删除消息"
          onClose={cancelDelete}
          actions={
            <>
              <Button onClick={cancelDelete}>取消</Button>
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
