/**
 * HWO Web 应用根组件
 *
 * 顶层布局（P0 改进：参考 JBL/Rim Attack/BasketPulse 三栏管理后台）：
 *   - 顶栏：品牌 + 赛季信息 + 用户区
 *   - 左栏：分组导航菜单（球會 / 人事 / 比赛）
 *   - 主区：当前视图内容
 *
 * 视图切换：
 *   - home      赛季主页（积分榜 + 今日赛程 + 我的球队）
 *   - schedule  赛程 / 结果页
 *   - team      球队管理页（阵容 + 战术）
 *   - trade     交易
 *   - career    球员生涯
 *   - academy   青训学院
 *   - draft     选秀大会
 *   - sim       比赛模拟
 */

import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthPage } from "./auth/AuthPage";
import { HomePage } from "./pages/HomePage";
import { SchedulePage } from "./pages/SchedulePage";
import { TeamPage } from "./pages/TeamPage";
import { TradePage } from "./pages/TradePage";
import { CareerPage } from "./pages/CareerPage";
import { AcademyPage } from "./pages/AcademyPage";
import { DraftPage } from "./pages/DraftPage";
import { MatchSimView } from "./views/MatchSimView";
import { fetchWorlds, fetchCurrentSeason } from "./api";
import type { SeasonInfo } from "./types";

type View =
  | { kind: "home" }
  | { kind: "schedule"; matchId?: string | null }
  | { kind: "team"; teamId: string }
  | { kind: "trade" }
  | { kind: "career" }
  | { kind: "academy" }
  | { kind: "draft" }
  | { kind: "sim" };

type NavKind =
  | "home"
  | "schedule"
  | "team"
  | "trade"
  | "career"
  | "academy"
  | "draft"
  | "sim";

/** 侧边栏分组导航 —— 参考 Rim Attack / BasketPulse 的分组菜单 */
const NAV_GROUPS: { group: string; items: { id: NavKind; label: string }[] }[] = [
  {
    group: "球會",
    items: [
      { id: "home", label: "主页" },
    ],
  },
  {
    group: "人事",
    items: [
      { id: "team", label: "我的球队" },
      { id: "trade", label: "交易" },
      { id: "career", label: "生涯" },
      { id: "academy", label: "青训" },
      { id: "draft", label: "选秀" },
    ],
  },
  {
    group: "比赛",
    items: [
      { id: "schedule", label: "赛程" },
      { id: "sim", label: "模拟" },
    ],
  },
];

function navToView(kind: NavKind, teamId?: string): View {
  if (kind === "home") return { kind: "home" };
  if (kind === "schedule") return { kind: "schedule" };
  if (kind === "team") return { kind: "team", teamId: teamId ?? "" };
  if (kind === "trade") return { kind: "trade" };
  if (kind === "career") return { kind: "career" };
  if (kind === "academy") return { kind: "academy" };
  if (kind === "draft") return { kind: "draft" };
  return { kind: "sim" };
}

/** 当前活动的 NavKind（team 用 kind 判断） */
function activeNav(view: View): NavKind {
  if (view.kind === "team") return "team";
  return view.kind as NavKind;
}

const STATUS_LABELS: Record<string, string> = {
  regular: "常规赛",
  playoff: "季后赛",
  offseason: "休赛期",
};

function seasonLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function AppInner() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState<View>({ kind: "home" });
  const [myWorldId, setMyWorldId] = useState<string | undefined>(undefined);
  const [season, setSeason] = useState<SeasonInfo | null>(null);

  // 查找我所在的世界（用于选秀页）
  useEffect(() => {
    if (!user?.teamId) return;
    fetchWorlds()
      .then((worlds) => {
        const w = worlds.find((world) =>
          world.teams.some((t) => t.id === user.teamId),
        );
        setMyWorldId(w?.id);
      })
      .catch(() => {});
  }, [user?.teamId]);

  // 顶栏赛季信息
  useEffect(() => {
    fetchCurrentSeason()
      .then(setSeason)
      .catch(() => {});
  }, []);

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

  const myTeamId = user.teamId;

  function openTeam(teamId: string) {
    setView({ kind: "team", teamId });
  }

  function handleNav(kind: NavKind) {
    if (kind === "team" && myTeamId) {
      setView({ kind: "team", teamId: myTeamId });
    } else {
      setView(navToView(kind, myTeamId ?? undefined));
    }
  }

  return (
    <div className="app-shell">
      {/* 顶栏：品牌 + 赛季信息 + 用户区 */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">HWO</span>
          <span className="brand-sub">Hoops World Online</span>
          <span className="brand-ver">v0.5.0</span>
        </div>
        <div className="header-season">
          {season ? (
            <>
              <span className="header-season-name">{season.name}</span>
              <span className="header-season-day">
                第 {season.currentDay} 日 · {seasonLabel(season.status)}
              </span>
            </>
          ) : (
            <span className="spinner-sm" />
          )}
        </div>
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

      <div className="app-body">
        {/* 左栏：分组导航 */}
        <aside className="app-sidebar">
          <nav className="sidebar-nav">
            {NAV_GROUPS.map((g) => (
              <div className="sidebar-group" key={g.group}>
                <div className="sidebar-group-title">{g.group}</div>
                {g.items.map((it) => {
                  const isActive = activeNav(view) === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`sidebar-item${isActive ? " is-active" : ""}`}
                      onClick={() => handleNav(it.id)}
                    >
                      <span className="sidebar-item-label">{it.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* 主区 */}
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
          {view.kind === "career" && myTeamId && (
            <CareerPage teamId={myTeamId} />
          )}
          {view.kind === "academy" && myTeamId && (
            <AcademyPage teamId={myTeamId} />
          )}
          {view.kind === "draft" && (
            <DraftPage worldId={myWorldId} myTeamId={myTeamId ?? undefined} />
          )}
          {view.kind === "sim" && <MatchSimView />}
        </main>
      </div>
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
