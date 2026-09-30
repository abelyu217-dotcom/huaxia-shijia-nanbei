/**
 * BoardPage —— 公布栏 / 讯息页
 *
 * 参考 Rim Attack 公布栏 + 讯息系统：
 *   - 公布栏 tab：联盟公告列表（前端 mock，生成 5-8 条模拟公告）
 *     每条公告显示标题、日期、正文摘要、类型标签（赛事 / 交易 / 系统 / 活动）
 *     点击展开查看详情
 *   - 讯息 tab：玩家私信列表（前端 mock + localStorage，key: hwo_messages）
 *     每条讯息显示发件人、标题、时间、已读 / 未读状态
 *     "撰写讯息" 按钮：弹出简单表单（收件人 / 标题 / 正文），发送后存入 localStorage
 *     点击讯息标记为已读
 *
 * 纯前端 mock + localStorage 驱动，不需要 props。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

type BoardTab = "board" | "messages";

type NoticeType = "event" | "trade" | "system" | "activity";

interface Notice {
  id: string;
  type: NoticeType;
  title: string;
  /** ISO 日期（yyyy-mm-dd） */
  date: string;
  summary: string;
  detail: string;
}

interface Message {
  id: string;
  sender: string;
  recipient: string;
  title: string;
  body: string;
  /** ISO 时间戳 */
  time: string;
  read: boolean;
}

const MESSAGES_KEY = "hwo_messages";

const NOTICE_TYPE_LABEL: Record<NoticeType, string> = {
  event: "赛事",
  trade: "交易",
  system: "系统",
  activity: "活动",
};

/** 公告模板池（每条提供类型 / 标题 / 摘要 / 详情） */
const NOTICE_TEMPLATES: Omit<Notice, "id" | "date">[] = [
  {
    type: "event",
    title: "赛季 MVP 评选开始",
    summary: "本赛季 MVP 候选名单已公布，请各经理在 7 日内完成投票。",
    detail:
      "联盟办公室依据球员综合表现、球队战绩与高光数据筛选出本赛季 MVP 候选名单。请各球队经理于本周日前完成投票，结果将在季后赛揭幕前公布。",
  },
  {
    type: "event",
    title: "全明星投票开启",
    summary: "全明星首发投票通道已开启，每日可投 1 轮，持续两周。",
    detail:
      "全明星赛首发阵容由球迷与经理共同投票决定。投票通道每日可投 1 轮，每人每轮最多选择 5 名球员。投票截止后将综合得票数选出东西部首发。",
  },
  {
    type: "trade",
    title: "交易截止日提醒",
    summary: "本赛季交易截止日为第 60 日 23:59，请提前完成交易申报。",
    detail:
      "为保障季后赛阵容稳定，本赛季交易截止日定为第 60 日 23:59。截止后所有跨队交易将被冻结，直至赛季结束并进入休赛期后恢复。",
  },
  {
    type: "event",
    title: "季后赛种子确定",
    summary: "常规赛已结束，东西部各 4 支种子球队已确认，对阵表已生成。",
    detail:
      "常规赛阶段全部场次已结算完毕，东西部各 4 支种子球队依据胜率排定。季后赛采用 4 强单败淘汰制，半决赛对阵为 1v4 / 2v3，胜者会师决赛。",
  },
  {
    type: "system",
    title: "服务器维护通知",
    summary: "本周四凌晨 02:00-04:00 将进行例行维护，期间暂停访问。",
    detail:
      "为提升服务稳定性，本周四凌晨 02:00-04:00 进行例行维护。维护期间登录、比赛模拟、交易等接口将暂停访问，已安排的比赛将在维护结束后继续结算。",
  },
  {
    type: "activity",
    title: "赛季庆典活动上线",
    summary: "赛季庆典限时活动开启，登录领取庆典礼包，参与任务赢取奖励。",
    detail:
      "赛季庆典限时活动现已开启！活动期间每日登录可领取庆典礼包，完成专属任务还可赢取游戏币、外观道具与稀有球员卡。活动持续至本赛季结束。",
  },
  {
    type: "trade",
    title: "自由球员池刷新",
    summary: "本周自由球员池已刷新，新增 3 名潜力新秀可供签约。",
    detail:
      "联盟已对自由球员池进行本周刷新，新增 3 名具备即战力与潜力的球员。薪资空间充足的球队可在交易页查看并签约，先到先得。",
  },
  {
    type: "system",
    title: "防沉迷系统升级",
    summary: "防沉迷系统已完成升级，未成年账号每日游戏时长受限。",
    detail:
      "为响应健康游戏倡议，防沉迷系统已完成升级。未成年账号每日累计在线时长超过限制后将无法继续推进赛程，相关信息以账号实名认证为准。",
  },
];

/** 初始 mock 私信（首次访问时写入 localStorage） */
const SEED_MESSAGES: Omit<Message, "id">[] = [
  {
    sender: "联盟办公室",
    recipient: "我",
    title: "欢迎来到 Hoops World Online",
    body: "欢迎经理入主球队！请前往主页生成赛程并推进比赛，开启你的执教之旅。",
    time: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    read: false,
  },
  {
    sender: "球探组",
    recipient: "我",
    title: "新秀观察报告已就绪",
    body: "本周球探发现的潜力新秀报告已生成，可在球探页查看详情并加入观察名单。",
    time: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    read: false,
  },
  {
    sender: "财务部",
    recipient: "我",
    title: "本月薪资结算完成",
    body: "本月球员薪资已结算完毕，可在财务页查看薪资总额与剩余空间详情。",
    time: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    read: true,
  },
];

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/** 容错解析 localStorage 中的讯息列表 */
function readMessages(): Message[] {
  const raw = readLS(MESSAGES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Message => typeof x === "object" && x !== null)
      .map((x) => ({
        id: String(x.id ?? cryptoRandomId()),
        sender: String(x.sender ?? "未知"),
        recipient: String(x.recipient ?? "我"),
        title: String(x.title ?? ""),
        body: String(x.body ?? ""),
        time: String(x.time ?? new Date().toISOString()),
        read: Boolean(x.read),
      }));
  } catch {
    return [];
  }
}

function saveMessages(list: Message[]): void {
  writeLS(MESSAGES_KEY, JSON.stringify(list));
}

/** 生成简短随机 ID（不依赖 crypto.randomUUID 以兼容旧浏览器） */
function cryptoRandomId(): string {
  return `m_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** 返回最近 N 天内的一个随机 ISO 日期字符串（yyyy-mm-dd） */
function randomRecentDate(days: number, seed: number): string {
  const offset = seed % days;
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** 日期格式化：yyyy-mm-dd → mm月dd日 */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/** 时间格式化：ISO → 相对时间或 mm-dd HH:MM */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function BoardPage() {
  const [tab, setTab] = useState<BoardTab>("board");

  // 公告：在首个 render 用 useMemo 生成稳定 mock 列表（5-8 条）
  const notices = useMemo<Notice[]>(() => {
    const count = 5 + (Math.floor(Math.random() * 4)); // 5..8
    const pool = [...NOTICE_TEMPLATES];
    // 简单洗牌取前 count 条
    const picked: Omit<Notice, "id" | "date">[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked.map((tpl, i) => ({
      id: `notice_${i + 1}`,
      type: tpl.type,
      title: tpl.title,
      summary: tpl.summary,
      detail: tpl.detail,
      date: randomRecentDate(30, i * 7 + 3),
    }));
  }, []);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);

  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState({
    recipient: "",
    title: "",
    body: "",
  });
  const [composeError, setComposeError] = useState<string | null>(null);

  // 首次加载：读取 localStorage；若为空则注入种子讯息
  const loadMessages = useCallback(() => {
    const existing = readMessages();
    if (existing.length === 0) {
      const seeded = SEED_MESSAGES.map((m) => ({
        ...m,
        id: cryptoRandomId(),
      }));
      saveMessages(seeded);
      setMessages(seeded);
    } else {
      setMessages(existing);
    }
    setMessagesLoaded(true);
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // 切换至讯息 tab 时确保已加载
  useEffect(() => {
    if (tab === "messages" && !messagesLoaded) {
      loadMessages();
    }
  }, [tab, messagesLoaded, loadMessages]);

  const unreadCount = useMemo(
    () => messages.filter((m) => !m.read).length,
    [messages],
  );

  function handleToggleNotice(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleOpenMessage(id: string) {
    setMessages((prev) => {
      const next = prev.map((m) =>
        m.id === id ? { ...m, read: true } : m,
      );
      saveMessages(next);
      return next;
    });
  }

  function handleMarkAllRead() {
    setMessages((prev) => {
      const next = prev.map((m) => ({ ...m, read: true }));
      saveMessages(next);
      return next;
    });
  }

  function handleComposeSubmit(e: FormEvent) {
    e.preventDefault();
    setComposeError(null);
    if (!compose.recipient.trim()) {
      setComposeError("请填写收件人");
      return;
    }
    if (!compose.title.trim()) {
      setComposeError("请填写标题");
      return;
    }
    const newMsg: Message = {
      id: cryptoRandomId(),
      sender: "我",
      recipient: compose.recipient.trim(),
      title: compose.title.trim(),
      body: compose.body.trim(),
      time: new Date().toISOString(),
      read: true,
    };
    setMessages((prev) => {
      const next = [newMsg, ...prev];
      saveMessages(next);
      return next;
    });
    setCompose({ recipient: "", title: "", body: "" });
    setComposing(false);
  }

  const sortedNotices = useMemo(
    () => [...notices].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [notices],
  );

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => (a.time < b.time ? 1 : -1)),
    [messages],
  );

  return (
    <div className="page board-page">
      <header className="page-head">
        <h2>公布栏 / 讯息</h2>
        <p className="muted">
          联盟公告与玩家私信中心，参考 Rim Attack 公布栏 + 讯息系统。
        </p>
      </header>

      <div className="tab-nav board-tabs">
        <button
          type="button"
          className={`tab${tab === "board" ? " is-active" : ""}`}
          onClick={() => setTab("board")}
        >
          公布栏
        </button>
        <button
          type="button"
          className={`tab${tab === "messages" ? " is-active" : ""}`}
          onClick={() => setTab("messages")}
        >
          讯息
          {unreadCount > 0 && (
            <span className="board-tab-badge">{unreadCount}</span>
          )}
        </button>
      </div>

      {tab === "board" && (
        <section className="panel">
          <div className="panel-head">
            <h2>联盟公告</h2>
            <span className="hint">共 {sortedNotices.length} 条 · 点击展开详情</span>
          </div>
          <div className="panel-body">
            {sortedNotices.length === 0 ? (
              <div className="empty-block">暂无联盟公告。</div>
            ) : (
              <ul className="notice-list">
                {sortedNotices.map((n) => {
                  const expanded = expandedId === n.id;
                  return (
                    <li
                      key={n.id}
                      className={`notice-item${expanded ? " is-expanded" : ""}`}
                    >
                      <button
                        type="button"
                        className="notice-item-head"
                        onClick={() => handleToggleNotice(n.id)}
                        aria-expanded={expanded}
                      >
                        <span
                          className={`notice-type notice-type-${n.type}`}
                        >
                          {NOTICE_TYPE_LABEL[n.type]}
                        </span>
                        <span className="notice-title">{n.title}</span>
                        <span className="notice-date">{formatDate(n.date)}</span>
                        <span
                          className={`notice-chevron${
                            expanded ? " is-open" : ""
                          }`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </button>
                      <div className="notice-summary">{n.summary}</div>
                      {expanded && (
                        <div className="notice-detail">{n.detail}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === "messages" && (
        <section className="panel">
          <div className="panel-head">
            <h2>玩家私信</h2>
            <span className="hint">
              共 {sortedMessages.length} 条 · 未读 {unreadCount}
            </span>
            <div className="row gap wrap">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={unreadCount === 0}
                onClick={handleMarkAllRead}
              >
                全部已读
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setComposing((v) => !v)}
              >
                {composing ? "收起撰写" : "撰写讯息"}
              </button>
            </div>
          </div>
          <div className="panel-body">
            {composing && (
              <form
                className="compose-form"
                onSubmit={handleComposeSubmit}
              >
                <div className="compose-row">
                  <label className="compose-label">收件人</label>
                  <input
                    type="text"
                    className="compose-input"
                    placeholder="输入经理名 / 球队名"
                    value={compose.recipient}
                    onChange={(e) =>
                      setCompose((c) => ({ ...c, recipient: e.target.value }))
                    }
                  />
                </div>
                <div className="compose-row">
                  <label className="compose-label">标题</label>
                  <input
                    type="text"
                    className="compose-input"
                    placeholder="输入讯息标题"
                    value={compose.title}
                    onChange={(e) =>
                      setCompose((c) => ({ ...c, title: e.target.value }))
                    }
                  />
                </div>
                <div className="compose-row">
                  <label className="compose-label">正文</label>
                  <textarea
                    className="compose-input compose-textarea"
                    placeholder="输入讯息正文（可选）"
                    rows={4}
                    value={compose.body}
                    onChange={(e) =>
                      setCompose((c) => ({ ...c, body: e.target.value }))
                    }
                  />
                </div>
                {composeError && (
                  <div className="state error compose-error">{composeError}</div>
                )}
                <div className="row gap wrap compose-actions">
                  <button type="submit" className="btn btn-primary btn-sm">
                    发送
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setComposing(false);
                      setComposeError(null);
                      setCompose({ recipient: "", title: "", body: "" });
                    }}
                  >
                    取消
                  </button>
                </div>
              </form>
            )}

            {sortedMessages.length === 0 ? (
              <div className="empty-block">暂无私信记录。</div>
            ) : (
              <ul className="message-list">
                {sortedMessages.map((m) => (
                  <li
                    key={m.id}
                    className={`message-item${m.read ? "" : " is-unread"}`}
                    onClick={() => handleOpenMessage(m.id)}
                  >
                    <span
                      className={`message-dot${m.read ? "" : " is-unread"}`}
                      aria-hidden="true"
                    />
                    <div className="message-main">
                      <div className="message-head">
                        <span className="message-sender">{m.sender}</span>
                        <span className="message-time">
                          {formatTime(m.time)}
                        </span>
                      </div>
                      <div className="message-title">{m.title}</div>
                      {m.body && (
                        <div className="message-body">{m.body}</div>
                      )}
                      <div className="message-foot">
                        <span className="muted">收件人：{m.recipient}</span>
                        {!m.read && <span className="message-unread-tag">未读</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
