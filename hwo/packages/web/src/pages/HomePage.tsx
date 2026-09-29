/**
 * HomePage — 世界 / 赛季主页
 *
 * 三块内容：
 *   1. 我的球队卡片：当前用户绑定的球队，显示战绩 + 今日对阵
 *   2. 积分榜：全部球队按胜率排序
 *   3. 今日赛程：当前 day 的比赛列表
 *
 * 右上角为管理操作：生成赛程 / 推进一日。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCurrentSeason,
  fetchSchedule,
  fetchStandings,
  fetchTeam,
  fetchTeams,
  postAdvanceDay,
  postAiRefresh,
  postAiTrain,
  postGenerateSchedule,
} from "../api";
import type {
  AiDifficulty,
  ScheduleDay,
  SeasonInfo,
  StandingRow,
  TeamDetail,
  TeamRoster,
} from "../types";
import { useAuth } from "../auth/AuthContext";
import { avgOvr, ovrTier, POSITION_LABEL } from "../lib";

interface Props {
  onOpenTeam: (teamId: string) => void;
  onOpenSchedule: () => void;
}

export function HomePage({ onOpenTeam, onOpenSchedule }: Props) {
  const { user } = useAuth();
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [teams, setTeams] = useState<TeamRoster[] | null>(null);
  const [myTeam, setMyTeam] = useState<TeamDetail | null>(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 加载我的球队详情（用户绑定的球队）
  useEffect(() => {
    if (!user?.teamId) {
      setMyTeam(null);
      return;
    }
    let cancelled = false;
    fetchTeam(user.teamId)
      .then((t) => {
        if (!cancelled) setMyTeam(t);
      })
      .catch(() => {
        if (!cancelled) setMyTeam(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.teamId]);

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

      <div className="home-grid">
        {/* 左侧：我的球队 */}
        <aside className="home-aside">
          <MyTeamCard
            team={myTeam}
            roster={myTeamRoster}
            standing={myStanding}
            todayMatch={myTodayMatch}
            opponent={myOpponent}
            onOpenTeam={() => user?.teamId && onOpenTeam(user.teamId)}
          />
        </aside>

        {/* 中间：积分榜 */}
        <section className="panel home-standings">
          <div className="panel-head">
            <h2>积分榜</h2>
            <span className="hint">按胜率排序</span>
          </div>
          <div className="panel-body">
            <StandingsTable
              rows={standings ?? []}
              myTeamId={user?.teamId ?? null}
            />
          </div>
        </section>
      </div>

      {/* 今日赛程 */}
      <section className="panel home-today">
        <div className="panel-head">
          <h2>今日赛程 · 第 {season?.currentDay ?? 0} 日</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onOpenSchedule}
          >
            查看全部赛程
          </button>
        </div>
        <div className="panel-body">
          {todayMatches.length === 0 ? (
            <div className="empty-block">今日休赛日，无比赛安排。</div>
          ) : (
            <TodayMatchList
              matches={todayMatches}
              myTeamId={user?.teamId ?? null}
            />
          )}
        </div>
      </section>
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
      <div className="panel my-team-card">
        <div className="panel-body">
          <div className="empty-block">
            当前账号尚未绑定球队。
            <br />
            请注册新账号以领取球队。
          </div>
        </div>
      </div>
    );
  }
  const ovrs = roster.players.map((p) => p.ovr);
  const avg = avgOvr(ovrs);
  const topPlayer = [...roster.players].sort((a, b) => b.ovr - a.ovr)[0];

  return (
    <div className="panel my-team-card">
      <div className="panel-head">
        <h2>我的球队</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onOpenTeam}
        >
          管理 →
        </button>
      </div>
      <div className="panel-body">
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
              <span
                className={`top-ovr tier-${ovrTier(topPlayer.ovr)}`}
              >
                {topPlayer.ovr}
              </span>
              <span className="top-pos">
                {POSITION_LABEL[topPlayer.position]}
              </span>
              <span className="top-name">{topPlayer.name}</span>
            </div>
          </div>
        )}
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
