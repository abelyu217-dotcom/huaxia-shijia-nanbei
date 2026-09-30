/**
 * HomePage — 仪表盘式主页
 *
 * 参考 BasketPulse 主页 5 模块卡片设计，整页布局为：
 *   - 顶部：赛季横幅（生成赛程 / 推进一日）
 *   - AI 经理控制条
 *   - 5 张仪表盘卡片（CSS grid，3/2/1 列响应式）：
 *       1. 战绩卡：球队战绩、胜率、连胜、今日对阵、当家球星
 *       2. 财务摘要卡：薪资总额 / 薪资帽 / 剩余空间 / 合同数 + 钱包（Coins/Credits）
 *       3. 训练概览卡：队伍平均 OVR / 最近训练提升数 / 青训学院等级
 *       4. 排名卡（精简版）：Top 8，高亮我的球队
 *       5. 赛程卡：今日比赛列表
 *
 * 所有数据在 loadAll 中并行加载；任一接口失败时显示 "—" 而非崩溃。
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
  postAdvanceDay,
  postAiRefresh,
  postAiTrain,
  postGenerateSchedule,
} from "../api";
import type {
  Academy,
  AiDifficulty,
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

  const [advancing, setAdvancing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiTraining, setAiTraining] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("normal");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 公共数据并行加载
      const [s, st, sch, ts] = await Promise.all([
        fetchCurrentSeason(),
        fetchStandings(),
        fetchSchedule(),
        fetchTeams(),
      ]);
      setSeason(s);
      setStandings(st);
      setSchedule(sch);
      setTeams(ts);

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

  async function handleAdvance() {
    setAdvancing(true);
    setActionMsg(null);
    try {
      const r = await postAdvanceDay();
      setActionMsg(
        `已结算 ${r.settled} 场，进入第 ${r.nextDay} 日${
          r.seasonEnded ? "（赛季已结束并交接）" : ""
        }`,
      );
      await loadAll();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancing(false);
    }
  }

  async function handleAiRefresh() {
    setAiRefreshing(true);
    setActionMsg(null);
    try {
      const r = await postAiRefresh(aiDifficulty);
      setActionMsg(`AI 经理已刷新 ${r.updated} 支球队阵容与战术（${aiDifficulty}）`);
      await loadAll();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAiRefreshing(false);
    }
  }

  async function handleAiTrain() {
    setAiTraining(true);
    setActionMsg(null);
    try {
      const r = await postAiTrain();
      setActionMsg(`AI 球队训练完成，共 ${r.playersTrained} 名球员能力提升`);
      await loadAll();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAiTraining(false);
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
      {/* 赛季横幅 */}
      <div className="season-banner">
        <div className="season-banner-main">
          <span className="season-status">
            {seasonStatusBadge(season?.status ?? "regular")}
          </span>
          <div className="season-name">
            {season?.name ?? "未开赛"} · 第 {season?.currentDay ?? 0} 日
          </div>
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
          <button
            type="button"
            className="btn btn-primary"
            disabled={advancing || !hasSchedule}
            onClick={handleAdvance}
          >
            {advancing ? "结算中…" : "推进一日"}
          </button>
        </div>
      </div>

      {actionMsg && <div className="home-action-msg">{actionMsg}</div>}

      {/* AI 经理控制条 */}
      <section className="panel home-ai-bar">
        <div className="panel-head">
          <h2>AI 经理</h2>
          <span className="hint">
            自动为 AI 球队刷新阵容/战术/训练（推进一日时会自动触发）
          </span>
        </div>
        <div className="panel-body ai-bar-body">
          <div className="ai-bar-left">
            <label className="ai-diff-label">难度</label>
            <select
              className="ai-diff-select"
              value={aiDifficulty}
              onChange={(e) => setAiDifficulty(e.target.value as AiDifficulty)}
              disabled={aiRefreshing}
            >
              <option value="easy">简单（随机决策）</option>
              <option value="normal">普通（按 OVR 选阵）</option>
              <option value="hard">困难（综合战术匹配）</option>
            </select>
          </div>
          <div className="ai-bar-right">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={aiRefreshing}
              onClick={handleAiRefresh}
            >
              {aiRefreshing ? "刷新中…" : "刷新 AI 阵容"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={aiTraining}
              onClick={handleAiTrain}
            >
              {aiTraining ? "训练中…" : "AI 训练"}
            </button>
          </div>
        </div>
      </section>

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

        {/* 5. 赛程卡（跨 2 列） */}
        <DashboardCard
          title={`今日赛程 · 第 ${season?.currentDay ?? 0} 日`}
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
          {todayMatches.length === 0 ? (
            <div className="empty-block">今日休赛日，无比赛安排。</div>
          ) : (
            <TodayMatchList
              matches={todayMatches}
              myTeamId={user?.teamId ?? null}
            />
          )}
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

function TodayMatchList({
  matches,
  myTeamId,
}: {
  matches: ScheduleDay["matches"];
  myTeamId: string | null;
}) {
  return (
    <div className="today-list">
      {matches.map((m) => {
        const involvesMe =
          myTeamId && (m.homeTeamId === myTeamId || m.awayTeamId === myTeamId);
        const homeWin = m.status === "final" && m.winnerId === m.homeTeamId;
        return (
          <div
            key={m.id}
            className={`today-match${involvesMe ? " is-mine" : ""}`}
          >
            <div className="tm-side home">
              <span className={`tm-name${homeWin ? " win" : ""}`}>
                {m.homeTeamName}
              </span>
              {m.homeScore != null && (
                <span className="tm-score">{m.homeScore}</span>
              )}
            </div>
            <div className="tm-center">
              {m.status === "scheduled" ? (
                <span className="tm-status scheduled">未开始</span>
              ) : m.status === "in_progress" ? (
                <span className="tm-status live">进行中</span>
              ) : (
                <span className="tm-status final">FINAL</span>
              )}
            </div>
            <div className="tm-side away">
              {m.awayScore != null && (
                <span className="tm-score">{m.awayScore}</span>
              )}
              <span
                className={`tm-name${
                  m.status === "final" && m.winnerId === m.awayTeamId
                    ? " win"
                    : ""
                }`}
              >
                {m.awayTeamName}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
