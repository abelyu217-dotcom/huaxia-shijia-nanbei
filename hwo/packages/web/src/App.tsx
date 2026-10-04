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
import { TrainingPage } from "./pages/TrainingPage";
import { StaffPage } from "./pages/StaffPage";
import { AcademyPage } from "./pages/AcademyPage";
import { DraftPage } from "./pages/DraftPage";
import { MatchSimView } from "./views/MatchSimView";
import { ShopPage } from "./pages/ShopPage";
import { FinancePage } from "./pages/FinancePage";
import { ContractPage } from "./pages/ContractPage";
import { LeaguePage } from "./pages/LeaguePage";
import { MatchTacticPage } from "./pages/MatchTacticPage";
import { ScoutPage } from "./pages/ScoutPage";
import { WatchlistPage } from "./pages/WatchlistPage";
import { PlayoffPage } from "./pages/PlayoffPage";
import { WorldInfoPage } from "./pages/WorldInfoPage";
import { ArenaPage } from "./pages/ArenaPage";
import { PvpPage } from "./pages/PvpPage";
import { CorePlayersPage } from "./pages/CorePlayersPage";
import { BoardOfDirectorsPage } from "./pages/BoardOfDirectorsPage";
import { PublicRelationsPage } from "./pages/PublicRelationsPage";
import { OperationsCenterPage } from "./pages/OperationsCenterPage";
import { MarketPage } from "./pages/MarketPage";
import { GuidePage } from "./pages/GuidePage";
import { DailyReward } from "./components/DailyReward";
import WorldSelectPage from "./pages/WorldSelectPage";
import AdminPage from "./pages/AdminPage";
import { IdentityPage } from "./pages/IdentityPage";
import { DynastyPage } from "./pages/DynastyPage";
import { RelationshipPage } from "./pages/RelationshipPage";
import { fetchWorlds, fetchCurrentSeason } from "./api";
import type { SeasonInfo } from "./types";

type View =
  | { kind: "home" }
  | { kind: "schedule"; matchId?: string | null }
  | { kind: "team"; teamId: string }
  | { kind: "trade" }
  | { kind: "career" }
  | { kind: "training" }
  | { kind: "staff" }
  | { kind: "academy" }
  | { kind: "draft" }
  | { kind: "sim" }
  | { kind: "shop" }
  | { kind: "finance" }
  | { kind: "contract" }
  | { kind: "league" }
  | { kind: "matchTactic"; matchId?: string }
  | { kind: "scout" }
  | { kind: "watchlist" }
  | { kind: "playoff" }
  | { kind: "pvp" }
  | { kind: "board" }
  | { kind: "worldInfo" }
  | { kind: "arena" }
  | { kind: "operations" }
  | { kind: "corePlayers" }
  | { kind: "market" }
  | { kind: "bod" }
  | { kind: "guide" }
  | { kind: "admin" }
  | { kind: "identity" }
  | { kind: "dynasty" }
  | { kind: "relationship" }
  | { kind: "intlLeague" }
  | { kind: "nationalTeam" }
  | { kind: "family" };

type NavKind =
  | "home"
  | "schedule"
  | "team"
  | "trade"
  | "career"
  | "training"
  | "staff"
  | "academy"
  | "draft"
  | "sim"
  | "shop"
  | "finance"
  | "contract"
  | "league"
  | "matchTactic"
  | "scout"
  | "watchlist"
  | "playoff"
  | "pvp"
  | "board"
  | "worldInfo"
  | "arena"
  | "operations"
  | "corePlayers"
  | "market"
  | "bod"
  | "guide"
  | "admin"
  | "identity"
  | "dynasty"
  | "relationship"
  | "intlLeague"
  | "nationalTeam"
  | "family";

/** 侧边栏分组导航 —— 参考 BasketPulse 的分组菜单 */
const NAV_GROUPS: { group: string; items: { id: NavKind; label: string }[] }[] = [
  {
    group: "家族",
    items: [
      { id: "family", label: "家族 · 敬请期待" },
    ],
  },
  {
    group: "俱乐部",
    items: [
      { id: "home", label: "概览" },
      { id: "finance", label: "财务" },
      { id: "bod", label: "董事会" },
      { id: "board", label: "公关部" },
      { id: "operations", label: "运营中心" },
      { id: "arena", label: "球馆" },
    ],
  },
  {
    group: "人事",
    items: [
      { id: "team", label: "球员名单" },
      { id: "corePlayers", label: "核心球员" },
      { id: "career", label: "球员生涯" },
      { id: "training", label: "训练中心" },
      { id: "staff", label: "职员中心" },
      { id: "scout", label: "人才中心" },
      { id: "market", label: "人才市场" },
      { id: "trade", label: "交易" },
      { id: "academy", label: "发展中心" },
      { id: "draft", label: "选秀" },
    ],
  },
  {
    group: "赛事",
    items: [
      { id: "schedule", label: "比赛" },
      { id: "playoff", label: "季后赛" },
      { id: "pvp", label: "PvP 对战" },
      { id: "matchTactic", label: "战术" },
      { id: "league", label: "国内联赛" },
      { id: "intlLeague", label: "国际联赛" },
      { id: "nationalTeam", label: "国家队" },
    ],
  },
  {
    group: "HWO",
    items: [
      { id: "worldInfo", label: "首页" },
      { id: "guide", label: "游戏说明" },
      { id: "shop", label: "信用点" },
    ],
  },
];

function navToView(kind: NavKind, teamId?: string): View {
  if (kind === "home") return { kind: "home" };
  if (kind === "schedule") return { kind: "schedule" };
  if (kind === "team") return { kind: "team", teamId: teamId ?? "" };
  if (kind === "trade") return { kind: "trade" };
  if (kind === "career") return { kind: "career" };
  if (kind === "training") return { kind: "training" };
  if (kind === "staff") return { kind: "staff" };
  if (kind === "academy") return { kind: "academy" };
  if (kind === "draft") return { kind: "draft" };
  if (kind === "shop") return { kind: "shop" };
  if (kind === "finance") return { kind: "finance" };
  if (kind === "contract") return { kind: "contract" };
  if (kind === "league") return { kind: "league" };
  if (kind === "matchTactic") return { kind: "matchTactic" };
  if (kind === "scout") return { kind: "scout" };
  if (kind === "watchlist") return { kind: "watchlist" };
  if (kind === "playoff") return { kind: "playoff" };
  if (kind === "pvp") return { kind: "pvp" };
  if (kind === "board") return { kind: "board" };
  if (kind === "worldInfo") return { kind: "worldInfo" };
  if (kind === "arena") return { kind: "arena" };
  if (kind === "operations") return { kind: "operations" };
  if (kind === "corePlayers") return { kind: "corePlayers" };
  if (kind === "market") return { kind: "market" };
  if (kind === "bod") return { kind: "bod" };
  if (kind === "guide") return { kind: "guide" };
  if (kind === "admin") return { kind: "admin" };
  if (kind === "identity") return { kind: "identity" };
  if (kind === "dynasty") return { kind: "dynasty" };
  if (kind === "relationship") return { kind: "relationship" };
  if (kind === "intlLeague") return { kind: "intlLeague" };
  if (kind === "nationalTeam") return { kind: "nationalTeam" };
  if (kind === "family") return { kind: "family" };
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
  const { user, loading, logout, refreshUser } = useAuth();
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

  // P1-3b：用户已登录但尚未认领球队 → 进入世界大厅选服
  if (!user.teamId) {
    return (
      <div className="app-shell">
        <WorldSelectPage onJoined={refreshUser} />
      </div>
    );
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
          <DailyReward />
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
            <SchedulePage
              initialMatchId={view.matchId ?? null}
              onOpenMatchTactic={(matchId) =>
                setView({ kind: "matchTactic", matchId })
              }
            />
          )}
          {view.kind === "team" && <TeamPage teamId={view.teamId} />}
          {view.kind === "trade" && myTeamId && (
            <TradePage myTeamId={myTeamId} />
          )}
          {view.kind === "career" && myTeamId && (
            <CareerPage teamId={myTeamId} />
          )}
          {view.kind === "training" && myTeamId && (
            <TrainingPage teamId={myTeamId} />
          )}
          {view.kind === "staff" && myTeamId && (
            <StaffPage teamId={myTeamId} />
          )}
          {view.kind === "academy" && myTeamId && (
            <AcademyPage teamId={myTeamId} />
          )}
          {view.kind === "draft" && (
            <DraftPage worldId={myWorldId} myTeamId={myTeamId ?? undefined} />
          )}
          {view.kind === "sim" && <MatchSimView />}
          {view.kind === "shop" && <ShopPage />}
          {view.kind === "finance" && myTeamId && (
            <FinancePage teamId={myTeamId} />
          )}
          {view.kind === "contract" && myTeamId && (
            <ContractPage teamId={myTeamId} worldId={myWorldId} />
          )}
          {view.kind === "league" && (
            <LeaguePage teamId={myTeamId ?? undefined} />
          )}
          {view.kind === "matchTactic" && (
            <MatchTacticPage
              teamId={myTeamId ?? undefined}
              matchId={view.matchId}
            />
          )}
          {view.kind === "scout" && (
            <ScoutPage teamId={myTeamId ?? undefined} />
          )}
          {view.kind === "watchlist" && <WatchlistPage />}
          {view.kind === "playoff" && <PlayoffPage />}
          {view.kind === "pvp" && <PvpPage teamId={myTeamId ?? undefined} />}
          {view.kind === "board" && (
            <PublicRelationsPage teamId={myTeamId ?? undefined} />
          )}
          {view.kind === "worldInfo" && (
            <WorldInfoPage onOpenTeam={openTeam} />
          )}
          {view.kind === "arena" && (
            <ArenaPage teamId={myTeamId ?? undefined} />
          )}
          {view.kind === "operations" && (
            <OperationsCenterPage teamId={myTeamId ?? undefined} />
          )}
          {view.kind === "corePlayers" && (
            <CorePlayersPage teamId={myTeamId ?? undefined} />
          )}
          {view.kind === "market" && (
            <MarketPage teamId={myTeamId ?? undefined} />
          )}
          {view.kind === "bod" && (
            <BoardOfDirectorsPage teamId={myTeamId ?? undefined} />
          )}
          {view.kind === "guide" && <GuidePage />}
          {view.kind === "admin" && <AdminPage />}
          {view.kind === "identity" && <IdentityPage />}
          {view.kind === "dynasty" && myTeamId && <DynastyPage teamId={myTeamId} />}
          {view.kind === "relationship" && myTeamId && <RelationshipPage teamId={myTeamId} />}
          {view.kind === "intlLeague" && <PlaceholderPage title="国际联赛" desc="国际联赛功能开发中，敬请期待。" />}
          {view.kind === "nationalTeam" && <PlaceholderPage title="国家队" desc="国家队功能开发中，敬请期待。" />}
          {view.kind === "family" && <PlaceholderPage title="家族" desc="家族功能开发中，敬请期待。" />}
        </main>
      </div>
    </div>
  );
}

/** 占位页面：用于尚未上线的功能模块 */
function PlaceholderPage({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="page-placeholder" style={{ padding: 48, textAlign: "center" }}>
      <h2 style={{ marginBottom: 12 }}>{title}</h2>
      <p style={{ color: "var(--text-muted, #888)" }}>{desc}</p>
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
