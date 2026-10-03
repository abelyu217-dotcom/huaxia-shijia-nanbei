/**
 * PublicRelationsPage —— 公关部页面（v0.6 §批次5）
 *
 * 三栏布局：
 *   1. 球队讯息（TeamMessage）—— 董事/赞助商/球员/球探等频道，可标记已读
 *   2. 媒体中心新闻（MediaNews）—— ESPN / NBA TV / 本地报纸 / 内幕
 *   3. 联盟公告（LeagueAnnouncement）—— 交易/伤病/禁赛/里程碑
 *
 * 数据源：
 *   - fetchPrOverview(teamId) → PrOverviewView（一次拉取全部数据）
 *   - markMessageRead / markAllMessagesRead → 已读管理
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchPrOverview,
  markMessageRead,
  markAllMessagesRead,
} from "../api";
import type {
  PrOverviewView,
  TeamMessageView,
} from "../types";

interface Props {
  teamId?: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  board: "董事会",
  sponsor: "赞助商",
  player: "球员",
  staff: "职员",
  scout: "球探",
  league: "联盟",
};

const SOURCE_LABEL: Record<string, string> = {
  espn: "ESPN",
  nba_tv: "NBA TV",
  local_paper: "本地报纸",
  insider: "内幕",
};

const CATEGORY_LABEL: Record<string, string> = {
  trade: "交易",
  game: "比赛",
  injury: "伤病",
  rumor: "传闻",
  front_office: "前线办公",
  fan: "球迷",
};

const ANNOUNCE_LABEL: Record<string, string> = {
  trade: "交易",
  injury: "伤病",
  suspension: "禁赛",
  milestone: "里程碑",
  rule_change: "规则变更",
  schedule_change: "赛程变更",
};

type Tab = "messages" | "news" | "announcements";

export function PublicRelationsPage({ teamId }: Props) {
  const { user } = useAuth();
  const resolvedTeamId = teamId || user?.teamId || "";

  const [overview, setOverview] = useState<PrOverviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("messages");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!resolvedTeamId) {
      setLoading(false);
      setError("未关联球队");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPrOverview(resolvedTeamId);
      setOverview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [resolvedTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkRead = useCallback(
    async (m: TeamMessageView) => {
      if (!resolvedTeamId || busy || m.read) return;
      setBusy(true);
      try {
        await markMessageRead(m.id, resolvedTeamId);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [resolvedTeamId, busy, load],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!resolvedTeamId || busy) return;
    setBusy(true);
    try {
      await markAllMessagesRead(resolvedTeamId);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [resolvedTeamId, busy, load]);

  if (loading) {
    return <div className="state"><span className="spinner" /> 加载公关部数据…</div>;
  }
  if (error) return <div className="state error">{error}</div>;
  if (!overview) return <div className="state muted">暂无数据</div>;

  return (
    <div className="page pr-page">
      <header className="page-head">
        <h2>公关部</h2>
        <p className="muted">
          球队讯息、媒体新闻与联盟公告统一中心（数据每日由后端自动生成）。
        </p>
        {overview.unreadCount > 0 && (
          <span className="badge badge-danger">{overview.unreadCount} 未读</span>
        )}
      </header>

      <div className="tab-bar">
        <button
          type="button"
          className={`tab-btn ${tab === "messages" ? "active" : ""}`}
          onClick={() => setTab("messages")}
        >
          球队讯息（{overview.messages.length}）
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "news" ? "active" : ""}`}
          onClick={() => setTab("news")}
        >
          媒体新闻（{overview.news.length}）
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "announcements" ? "active" : ""}`}
          onClick={() => setTab("announcements")}
        >
          联盟公告（{overview.announcements.length}）
        </button>
      </div>

      {tab === "messages" && (
        <section className="card">
          <div className="card-head">
            <h3>球队讯息</h3>
            {overview.unreadCount > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={handleMarkAllRead}
              >
                全部标记已读
              </button>
            )}
          </div>
          {overview.messages.length === 0 ? (
            <p className="muted">暂无讯息</p>
          ) : (
            <ul className="msg-list">
              {overview.messages.map((m) => (
                <li
                  key={m.id}
                  className={`msg-item ${m.read ? "msg-read" : "msg-unread"}`}
                >
                  <div className="msg-main">
                    <div className="msg-title-row">
                      <span className="msg-channel">
                        {CHANNEL_LABEL[m.channel] ?? m.channel}
                      </span>
                      <span className="msg-title">{m.title}</span>
                      {!m.read && <span className="badge badge-warn">未读</span>}
                    </div>
                    <div className="msg-content muted">{m.content}</div>
                    <div className="msg-meta muted small">
                      第 {m.day} 日 · {new Date(m.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <div className="msg-action">
                    {!m.read && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => handleMarkRead(m)}
                      >
                        标记已读
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "news" && (
        <section className="card">
          <h3>媒体新闻</h3>
          {overview.news.length === 0 ? (
            <p className="muted">暂无新闻</p>
          ) : (
            <ul className="news-list">
              {overview.news.map((n) => (
                <li key={n.id} className="news-item">
                  <div className="news-head">
                    <span className={`badge badge-source-${n.source}`}>
                      {SOURCE_LABEL[n.source] ?? n.source}
                    </span>
                    <span className="badge badge-category">{CATEGORY_LABEL[n.category] ?? n.category}</span>
                    <span className="news-title">{n.title}</span>
                  </div>
                  <div className="news-content muted">{n.content}</div>
                  <div className="news-meta muted small">
                    第 {n.day} 日 · {new Date(n.createdAt).toLocaleString("zh-CN")}
                    {n.tags.length > 0 && ` · 标签：${n.tags.join(", ")}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "announcements" && (
        <section className="card">
          <h3>联盟公告</h3>
          {overview.announcements.length === 0 ? (
            <p className="muted">暂无公告</p>
          ) : (
            <ul className="announce-list">
              {overview.announcements.map((a) => (
                <li key={a.id} className="announce-item">
                  <div className="announce-head">
                    <span className="badge badge-category">
                      {ANNOUNCE_LABEL[a.category] ?? a.category}
                    </span>
                    <span className="announce-title">{a.title}</span>
                  </div>
                  <div className="announce-content muted">{a.content}</div>
                  <div className="announce-meta muted small">
                    第 {a.day} 日 · {new Date(a.createdAt).toLocaleString("zh-CN")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// 导出标签映射供其他组件复用
export { CHANNEL_LABEL, SOURCE_LABEL, CATEGORY_LABEL };
