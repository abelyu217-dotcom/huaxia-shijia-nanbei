/**
 * HWO Web 应用根组件
 *
 * 顶层路由（无 react-router，使用内部 state 切换视图）：
 *   - 未登录 → AuthPage（登录 / 注册）
 *   - 已登录 → 应用骨架（顶部导航 + 主内容区）
 *
 * 视图切换：
 *   - home      世界 / 赛季主页（积分榜 + 今日赛程 + 我的球队）
 *   - schedule  赛程 / 结果页（日历视图 + 比赛 PBP/Box Score 回看）
 *   - team      球队管理页（LineupEditor + 战术 + 球员详情）
 *   - sim       比赛模拟（保留 M0 体验：选两支球队跑一场）
 *
 * 启动时由 AuthProvider 恢复登录态；加载中显示骨架屏。
 */

import { useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthPage } from "./auth/AuthPage";
import { HomePage } from "./pages/HomePage";
import { SchedulePage } from "./pages/SchedulePage";
import { TeamPage } from "./pages/TeamPage";
import { TradePage } from "./pages/TradePage";
import { MatchSimView } from "./views/MatchSimView";

type View =
  | { kind: "home" }
  | { kind: "schedule"; matchId?: string | null }
  | { kind: "team"; teamId: string }
  | { kind: "trade" }
  | { kind: "sim" };

type NavKind = "home" | "schedule" | "trade" | "sim";

const NAV_ITEMS: { id: NavKind; label: string }[] = [
  { id: "home", label: "主页" },
  { id: "schedule", label: "赛程" },
  { id: "trade", label: "交易" },
  { id: "sim", label: "模拟" },
];

function navToView(kind: NavKind): View {
  if (kind === "home") return { kind: "home" };
  if (kind === "schedule") return { kind: "schedule" };
  if (kind === "trade") return { kind: "trade" };
  return { kind: "sim" };
}

function AppInner() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState<View>({ kind: "home" });

  // 启动恢复期：渲染骨架，避免闪烁
  if (loading) {
    return (
      <div className="app-shell">
        <div className="state" style={{ marginTop: 80 }}>
          <span className="spinner" /> 正在恢复会话…
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  // 我的球队快捷入口
  const myTeamId = user.teamId;

  function openTeam(teamId: string) {
    setView({ kind: "team", teamId });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">HWO</span>
          <span className="brand-sub">Hoops World Online</span>
          <span className="brand-ver">v0.2.0</span>
        </div>
        <nav className="tab-nav">
          {NAV_ITEMS.map((it) => (
            <button
              key={it.id}
              type="button"
              className={`tab${view.kind === it.id ? " is-active" : ""}`}
              onClick={() => setView(navToView(it.id))}
            >
              {it.label}
            </button>
          ))}
          {myTeamId && (
            <button
              type="button"
              className={`tab${view.kind === "team" ? " is-active" : ""}`}
              onClick={() => openTeam(myTeamId)}
            >
              我的球队
            </button>
          )}
        </nav>
        <div className="header-user">
          <span className="header-user-name">{user.nickname}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={logout}
          >
            登出
          </button>
        </div>
      </header>

      <main className="app-main">
        {view.kind === "home" && (
          <HomePage
            onOpenTeam={openTeam}
            onOpenSchedule={() => setView({ kind: "schedule" })}
          />
        )}
        {view.kind === "schedule" && (
          <SchedulePage initialMatchId={view.matchId ?? null} />
        )}
        {view.kind === "team" && <TeamPage teamId={view.teamId} />}
        {view.kind === "trade" && myTeamId && (
          <TradePage myTeamId={myTeamId} />
        )}
        {view.kind === "sim" && <MatchSimView />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
