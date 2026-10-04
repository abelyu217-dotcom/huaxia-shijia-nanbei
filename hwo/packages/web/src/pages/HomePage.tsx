/**
 * HomePage — 仪表盘式主页
 *
 * v0.6 调整：
 *   - 顶部：世界时钟横幅（自动走时间，可暂停/调速，去除"推进一日"按钮）
 *   - 去除 AI 经理模块（后端 day 切换时自动触发）
 *   - "今日赛程"卡 → "球队资讯"卡（占位，事件源后续批次填充）
 *   - 5 张仪表盘卡片：战绩 / 财务摘要 / 训练概览 / 排名 / 球队资讯
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchAcademy,
  fetchCurrentSeason,
  fetchSchedule,
  fetchStandings,
  fetchTeam,
  fetchTeamCareers,
  fetchTeamSalary,
  fetchTeams,
  fetchWallet,
  fetchWorldClock,
  postGenerateSchedule,
  postWorldClockPause,
  postWorldClockSpeed,
  type WorldClockStatus,
} from "../api";
import type {
  Academy,
  PlayerCareer,
  SalaryStatus,
  ScheduleDay,
  SeasonInfo,
  StandingRow,
  TeamDetail,
  TeamRoster,
  WalletInfo,
} from "../types";
import { useAuth } from "../auth/AuthContext";
import { avgOvr, ovrTier, ovrVal, POSITION_LABEL } from "../lib";

interface Props {
  onOpenTeam: (teamId: string) => void;
  onOpenSchedule: () => void;
}

const TOP_STANDINGS = 8;

export function HomePage({ onOpenTeam, onOpenSchedule }: Props) {
  const { user } = useAuth();
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [teams, setTeams] = useState<TeamRoster[] | null>(null);
  const [myTeam, setMyTeam] = useState<TeamDetail | null>(null);

  // 新增：财务 + 训练相关状态
  const [salary, setSalary] = useState<SalaryStatus | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [careers, setCareers] = useState<PlayerCareer[] | null>(null);
  const [academy, setAcademy] = useState<Academy | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [clock, setClock] = useState<WorldClockStatus | null>(null);
  const [clockBusy, setClockBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 公共数据并行加载
      const [s, st, sch, ts, wc] = await Promise.all([
        fetchCurrentSeason(),
        fetchStandings(),
        fetchSchedule(),
        fetchTeams(),
        fetchWorldClock(),
      ]);
      setSeason(s);
      setStandings(st);
      setSchedule(sch);
      setTeams(ts);
      setClock(wc);

      // 用户绑定球队相关数据并行加载；任一失败不阻塞其他
      const teamId = user?.teamId;
      if (teamId) {
        const [teamRes, salaryRes, walletRes, careersRes, academyRes] =
          await Promise.allSettled([
            fetchTeam(teamId),
            fetchTeamSalary(teamId),
            fetchWallet(),
            fetchTeamCareers(teamId),
            fetchAcademy(teamId),
          ]);
        setMyTeam(teamRes.status === "fulfilled" ? teamRes.value : null);
        setSalary(salaryRes.status === "fulfilled" ? salaryRes.value : null);
        setWallet(walletRes.status === "fulfilled" ? walletRes.value : null);
        setCareers(
          careersRes.status === "fulfilled" ? careersRes.value : null,
        );
        setAcademy(academyRes.status === "fulfilled" ? academyRes.value : null);
      } else {
        setMyTeam(null);
        setSalary(null);
        setWallet(null);
        setCareers(null);
        setAcademy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user?.teamId]);

  // v0.6 世界时钟轮询：每 5 秒刷新一次时钟状态
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const wc = await fetchWorldClock();
        if (alive) {
          setClock(wc);
          // 时钟推进后同步刷新赛季信息
          setSeason((prev) =>
            prev && prev.currentDay !== wc.currentDay
              ? { ...prev, currentDay: wc.currentDay }
              : prev,
          );
        }
      } catch {
        // 时钟轮询失败忽略
      }
    };
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const todayMatches = useMemo(() => {
    if (!schedule || !season) return [];
    return (schedule.find((d) => d.day === season.currentDay)?.matches ?? []).slice();
  }, [schedule, season]);

  const myStanding = useMemo(() => {
    if (!standings || !user?.teamId) return null;
    return standings.find((s) => s.teamId === user.teamId) ?? null;
  }, [standings, user?.teamId]);

  const myTeamRoster = useMemo(() => {
    if (!teams || !user?.teamId) return null;
    return teams.find((t) => t.id === user.teamId) ?? null;
  }, [teams, user?.teamId]);

  // 队伍平均 OVR：优先用 TeamDetail（含完整球员列表），回退到 TeamRoster
  const myAvgOvr = useMemo(() => {
    if (myTeam?.players?.length) {
      return avgOvr(myTeam.players.map((p) => ovrVal(p.ovr)));
    }
    if (myTeamRoster?.players?.length) {
      return avgOvr(myTeamRoster.players.map((p) => ovrVal(p.ovr)));
    }
    return null;
  }, [myTeam, myTeamRoster]);

  const myTodayMatch = useMemo(() => {
    if (!user?.teamId || todayMatches.length === 0) return null;
    return (
      todayMatches.find(
        (m) => m.homeTeamId === user.teamId || m.awayTeamId === user.teamId,
      ) ?? null
    );
  }, [todayMatches, user?.teamId]);

  const myOpponent = useMemo(() => {
    if (!myTodayMatch || !user?.teamId) return null;
    const isHome = myTodayMatch.homeTeamId === user.teamId;
    return {
      id: isHome ? myTodayMatch.awayTeamId : myTodayMatch.homeTeamId,
      name: isHome ? myTodayMatch.awayTeamName : myTodayMatch.homeTeamName,
      isHome,
    };
  }, [myTodayMatch, user?.teamId]);

  async function handleGenerate() {
    setGenerating(true);
    setActionMsg(null);
    try {
      const r = await postGenerateSchedule();
      setActionMsg(`已生成 ${r.generated} 场赛程`);
      await loadAll();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  // v0.6 世界时钟控制
  async function handleTogglePause() {
    if (!clock) return;
    setClockBusy(true);
    try {
      const next = await postWorldClockPause(!clock.paused);
      setClock(next);
      setActionMsg(next.paused ? "世界时钟已暂停" : "世界时钟已恢复");
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setClockBusy(false);
    }
  }

  async function handleSpeed(speed: 1 | 2 | 4 | 8 | 16 | 32 | 60) {
    setClockBusy(true);
    try {
      const next = await postWorldClockSpeed(speed);
      setClock(next);
      setActionMsg(`世界时钟加速 ${speed}x`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setClockBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 正在加载赛季信息…
      </div>
    );
  }
  if (error) {
    return <div className="state error">加载失败：{error}</div>;
  }

  const hasSchedule = (schedule?.length ?? 0) > 0;
  const teamBound = Boolean(user?.teamId);

  return (
    <div className="home-page">
      {/* v0.6 世界时钟横幅（自动走时间，可暂停/调速） */}
      <div className="season-banner">
        <div className="season-banner-main">
          <span className="season-status">
            {seasonStatusBadge(season?.status ?? "regular")}
          </span>
          <div className="season-name">
            {(season?.displayName || season?.name) ?? "未开赛"} · 第 {clock?.currentDay ?? season?.currentDay ?? 0} 日
          </div>
          {clock && (
            <span className={`clock-state ${clock.paused ? "paused" : "running"}`}>
              {clock.paused ? "已暂停" : "运行中"}
            </span>
          )}
        </div>
        <div className="season-actions">
          {!hasSchedule && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={generating}
              onClick={handleGenerate}
            >
              {generating ? "生成中…" : "生成赛程"}
            </button>
          )}
          {clock && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={clockBusy}
                onClick={handleTogglePause}
              >
                {clock.paused ? "恢复" : "暂停"}
              </button>
              <div className="clock-speed-group" role="group" aria-label="加速倍率">
                {([1, 2, 4, 8, 16, 32, 60] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn btn-ghost btn-sm ${clock.speed === s ? "active" : ""}`}
                    disabled={clockBusy}
                    onClick={() => handleSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {actionMsg && <div className="home-action-msg">{actionMsg}</div>}

      {/* v0.6 AI 经理模块已移除（后端 day 切换时自动触发） */}

      {/* 5 模块仪表盘卡片 */}
      <div className="dashboard-grid">
        {/* 1. 战绩卡 */}
        <DashboardCard title="战绩" hint="我的球队">
          <MyTeamCard
            team={myTeam}
            roster={myTeamRoster}
            standing={myStanding}
            todayMatch={myTodayMatch}
            opponent={myOpponent}
            onOpenTeam={() => user?.teamId && onOpenTeam(user.teamId)}
          />
        </DashboardCard>

        {/* 2. 财务摘要卡 */}
        <DashboardCard title="财务摘要" hint="薪资与钱包">
          <FinanceSummaryCard
            salary={salary}
            wallet={wallet}
            teamBound={teamBound}
          />
        </DashboardCard>

        {/* 3. 训练概览卡 */}
        <DashboardCard title="训练概览" hint="能力提升与青训">
          <TrainingSummaryCard
            careers={careers}
            academy={academy}
            avgOvrValue={myAvgOvr}
            teamBound={teamBound}
          />
        </DashboardCard>

        {/* 4. 排名卡（精简版 Top 8） */}
        <DashboardCard title="积分榜" hint={`Top ${TOP_STANDINGS} · 按胜率排序`}>
          <StandingsTable
            rows={(standings ?? []).slice(0, TOP_STANDINGS)}
            myTeamId={user?.teamId ?? null}
          />
        </DashboardCard>

        {/* v0.6 球队资讯卡（替代今日赛程，事件源后续批次填充） */}
        <DashboardCard
          title={`球队资讯 · 第 ${clock?.currentDay ?? season?.currentDay ?? 0} 日`}
          wide
          action={
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onOpenSchedule}
            >
              查看全部赛程
            </button>
          }
        >
          <div className="empty-block">
            球队资讯流将在后续批次填充（含比赛结果 / 训练成果 / 转会动态 / 合同 / 财务 / 董事会 / 球迷 / 青训 / 设施等事件）。
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}

function seasonStatusBadge(status: string): string {
  switch (status) {
    case "regular":
      return "常规赛";
    case "playoff":
      return "季后赛";
    case "offseason":
      return "休赛期";
    default:
      return status;
  }
}

/** 金额格式化：薪资数据后端以"万"为单位返回（与 TeamPage/TradePage 对齐）。 */
function fmtSalary(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toLocaleString()} 万`;
}

interface DashboardCardProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  /** 跨 2 列（大屏）/ 全宽（小屏） */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}

function DashboardCard({
  title,
  hint,
  action,
  wide,
  className,
  children,
}: DashboardCardProps) {
  const cls = [
    "panel",
    "dashboard-card",
    wide ? "dashboard-card--wide" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={cls}>
      <div className="panel-head">
        <h2>{title}</h2>
        {hint && <span className="hint">{hint}</span>}
        {action && <div className="dashboard-card-action">{action}</div>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

interface MyTeamCardProps {
  team: TeamDetail | null;
  roster: TeamRoster | null;
  standing: StandingRow | null;
  todayMatch: ScheduleDay["matches"][number] | null;
  opponent: { id: string; name: string; isHome: boolean } | null;
  onOpenTeam: () => void;
}

function MyTeamCard({
  team,
  roster,
  standing,
  todayMatch,
  opponent,
  onOpenTeam,
}: MyTeamCardProps) {
  if (!team || !roster) {
    return (
      <div className="empty-block">
        当前账号尚未绑定球队。
        <br />
        请注册新账号以领取球队。
      </div>
    );
  }
  const ovrs = roster.players.map((p) => ovrVal(p.ovr));
  const avg = avgOvr(ovrs);
  const topPlayer = [...roster.players].sort((a, b) => ovrVal(b.ovr) - ovrVal(a.ovr))[0];

  return (
    <div className="my-team-card-inner">
      <div className="my-team-head">
        <div className="my-team-name">{team.name}</div>
        <div className="my-team-ovr">
          <span className="ovr-pill">{avg}</span>
          <span className="ovr-label">平均 OVR</span>
        </div>
      </div>

      <div className="my-team-stats">
        <div className="mts-item">
          <span className="mts-label">战绩</span>
          <span className="mts-value">
            {standing ? `${standing.wins}-${standing.losses}` : "—"}
          </span>
        </div>
        <div className="mts-item">
          <span className="mts-label">胜率</span>
          <span className="mts-value">
            {standing ? `${(standing.winRate * 100).toFixed(1)}%` : "—"}
          </span>
        </div>
        <div className="mts-item">
          <span className="mts-label">连胜/连败</span>
          <span className="mts-value">{standing?.streak ?? "—"}</span>
        </div>
      </div>

      <div className="my-team-today">
        <div className="mts-sub">今日对阵</div>
        {todayMatch && opponent ? (
          <div className="today-vs">
            <span className={opponent.isHome ? "side home" : "side"}>
              {opponent.isHome ? "主" : "客"}
            </span>
            <span className="today-vs-vs">vs</span>
            <span className="today-opp">{opponent.name}</span>
            {todayMatch.status === "final" && todayMatch.homeScore != null && (
              <span className="today-score">
                {todayMatch.homeScore}:{todayMatch.awayScore}
              </span>
            )}
          </div>
        ) : (
          <div className="today-vs empty">今日休战</div>
        )}
      </div>

      {topPlayer && (
        <div className="my-team-top">
          <div className="mts-sub">当家球星</div>
          <div className="top-player">
            <span className={`top-ovr tier-${ovrTier(ovrVal(topPlayer.ovr))}`}>
              {ovrVal(topPlayer.ovr)}
            </span>
            <span className="top-pos">
              {POSITION_LABEL[topPlayer.position]}
            </span>
            <span className="top-name">{topPlayer.name}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn btn-ghost btn-sm my-team-manage"
        onClick={onOpenTeam}
      >
        管理球队 →
      </button>
    </div>
  );
}

interface FinanceSummaryCardProps {
  salary: SalaryStatus | null;
  wallet: WalletInfo | null;
  teamBound: boolean;
}

function FinanceSummaryCard({
  salary,
  wallet,
  teamBound,
}: FinanceSummaryCardProps) {
  if (!teamBound) {
    return <div className="empty-block">未绑定球队</div>;
  }
  return (
    <div className="summary-grid finance-grid">
      <div className="summary-item">
        <span className="summary-label">薪资总额</span>
        <span className="summary-value">
          {salary ? fmtSalary(salary.totalSalary) : "—"}
        </span>
      </div>
      <div className="summary-item">
        <span className="summary-label">薪资帽</span>
        <span className="summary-value">
          {salary ? fmtSalary(salary.salaryCap) : "—"}
        </span>
      </div>
      <div className="summary-item">
        <span className="summary-label">剩余空间</span>
        <span
          className={`summary-value${
            salary && salary.remaining < 0 ? " is-bad" : ""
          }`}
        >
          {salary ? fmtSalary(salary.remaining) : "—"}
        </span>
      </div>
      <div className="summary-item">
        <span className="summary-label">合同数</span>
        <span className="summary-value">
          {salary ? salary.contractCount : "—"}
        </span>
      </div>
      <div className="summary-item summary-wallet">
        <span className="summary-label">🪙 游戏币</span>
        <span className="summary-value">
          {wallet ? wallet.coins.toLocaleString() : "—"}
        </span>
      </div>
      <div className="summary-item summary-wallet">
        <span className="summary-label">💎 充值币</span>
        <span className="summary-value">
          {wallet ? wallet.credits.toLocaleString() : "—"}
        </span>
      </div>
    </div>
  );
}

interface TrainingSummaryCardProps {
  careers: PlayerCareer[] | null;
  academy: Academy | null;
  avgOvrValue: number | null;
  teamBound: boolean;
}

function TrainingSummaryCard({
  careers,
  academy,
  avgOvrValue,
  teamBound,
}: TrainingSummaryCardProps) {
  if (!teamBound) {
    return <div className="empty-block">未绑定球队</div>;
  }
  // PlayerCareer 没有 ovrBefore/ovrAfter 字段，使用 trainExp > 0 作为"已发生训练提升"的代理指标
  const trainedCount = careers
    ? careers.filter((c) => (c.trainExp ?? 0) > 0).length
    : null;
  return (
    <div className="summary-grid training-grid">
      <div className="summary-item">
        <span className="summary-label">队伍平均 OVR</span>
        <span className="summary-value">
          {avgOvrValue != null ? avgOvrValue : "—"}
        </span>
      </div>
      <div className="summary-item">
        <span className="summary-label">最近训练提升</span>
        <span className="summary-value">
          {trainedCount != null ? `${trainedCount} 人` : "—"}
        </span>
      </div>
      <div className="summary-item">
        <span className="summary-label">青训学院</span>
        <span className="summary-value">
          {academy ? `Lv.${academy.level}` : "—"}
        </span>
      </div>
    </div>
  );
}

function StandingsTable({
  rows,
  myTeamId,
}: {
  rows: StandingRow[];
  myTeamId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-block">尚无积分榜数据。推进一日以结算比赛。</div>
    );
  }
  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th className="col-rank">#</th>
          <th className="col-team">球队</th>
          <th>胜</th>
          <th>负</th>
          <th>胜率</th>
          <th>得分</th>
          <th>失分</th>
          <th>近况</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isMine = r.teamId === myTeamId;
          return (
            <tr key={r.teamId} className={isMine ? "is-mine" : ""}>
              <td className="col-rank">{i + 1}</td>
              <td className="col-team">
                {isMine && <span className="mine-dot" />}
                {r.teamName}
              </td>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>{(r.winRate * 100).toFixed(1)}%</td>
              <td>{r.pointsFor}</td>
              <td>{r.pointsAgainst}</td>
              <td>
                <span
                  className={`streak-chip ${
                    r.streak?.startsWith("W") ? "win" : "loss"
                  }`}
                >
                  {r.streak ?? "—"}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
