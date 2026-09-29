/**
 * SchedulePage — 赛程 / 结果页
 *
 * - 左侧：日历视图（按日列出全部赛程，可点击切换选中日）
 * - 右侧：选中日的比赛列表，点击单场可查看 PBP / Box Score 回看
 *
 * 点击某场比赛时，调用 POST /api/sim/match 重新模拟（同 seed 不存在，
 * 因此该功能在 M1 阶段为"用同一对阵跑一场示例回看"）。
 * 完整的"原始比赛回放"需 M2 阶段持久化 PBP，本页保持向后兼容。
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchCurrentSeason,
  fetchSchedule,
  fetchTactics,
  fetchTeam,
  postSimMatch,
} from "../api";
import type {
  ScheduleDay,
  SeasonInfo,
  SimOutput,
  TacticPreset,
  TeamDetail,
} from "../types";
import { useAuth } from "../auth/AuthContext";
import { PbpFeed } from "../components/PbpFeed";
import { BoxScoreTable } from "../components/BoxScoreTable";
import { QuarterScoreTable } from "../components/QuarterScoreTable";

interface Props {
  initialMatchId?: string | null;
}

export function SchedulePage({ initialMatchId }: Props) {
  const { user } = useAuth();
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // 回看面板状态
  const [reviewing, setReviewing] = useState<{
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeTeamName: string;
    awayTeamName: string;
  } | null>(null);
  const [tactics, setTactics] = useState<TacticPreset[] | null>(null);
  const [homeTeam, setHomeTeam] = useState<TeamDetail | null>(null);
  const [awayTeam, setAwayTeam] = useState<TeamDetail | null>(null);
  const [simOutput, setSimOutput] = useState<SimOutput | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCurrentSeason(), fetchSchedule(), fetchTactics()])
      .then(([s, sch, ts]) => {
        if (cancelled) return;
        setSeason(s);
        setSchedule(sch);
        setTactics(ts);
        setSelectedDay(s.currentDay);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 选中要回看的比赛，先加载球队详情，再触发模拟
  useEffect(() => {
    if (!reviewing) return;
    let cancelled = false;
    setSimOutput(null);
    setSimError(null);
    setSimLoading(true);
    (async () => {
      try {
        const [ht, at] = await Promise.all([
          fetchTeam(reviewing.homeTeamId),
          fetchTeam(reviewing.awayTeamId),
        ]);
        if (cancelled) return;
        setHomeTeam(ht);
        setAwayTeam(at);
        // 默认双方都用第一个战术
        const defaultTactic = tactics?.[0]?.id ?? "pace_space";
        const out = await postSimMatch({
          homeTeamId: reviewing.homeTeamId,
          awayTeamId: reviewing.awayTeamId,
          homeTacticId: defaultTactic,
          awayTacticId: defaultTactic,
        });
        if (!cancelled) setSimOutput(out);
      } catch (e) {
        if (!cancelled)
          setSimError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSimLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewing, tactics]);

  // 处理初始 matchId（从主页跳转）
  useEffect(() => {
    if (!initialMatchId || !schedule) return;
    for (const day of schedule) {
      const m = day.matches.find((mm) => mm.id === initialMatchId);
      if (m) {
        setSelectedDay(day.day);
        setReviewing({
          matchId: m.id,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeTeamName: m.homeTeamName,
          awayTeamName: m.awayTeamName,
        });
        break;
      }
    }
  }, [initialMatchId, schedule]);

  const selectedDayMatches = useMemo(() => {
    if (!schedule || selectedDay == null) return [];
    return schedule.find((d) => d.day === selectedDay)?.matches ?? [];
  }, [schedule, selectedDay]);

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 正在加载赛程…
      </div>
    );
  }
  if (error) {
    return <div className="state error">赛程加载失败：{error}</div>;
  }
  if (!schedule || schedule.length === 0) {
    return (
      <div className="empty-block">
        当前赛季尚未生成赛程。回到主页点击「生成赛程」即可。
      </div>
    );
  }

  return (
    <div className="schedule-page">
      <div className="schedule-layout">
        {/* 左侧日历 */}
        <aside className="schedule-calendar panel">
          <div className="panel-head">
            <h2>赛程日历</h2>
            <span className="hint">{season?.name}</span>
          </div>
          <div className="panel-body calendar-body">
            {schedule.map((d) => {
              const isToday = d.day === season?.currentDay;
              const isSelected = d.day === selectedDay;
              const hasFinal = d.matches.some((m) => m.status === "final");
              const hasMine = user?.teamId
                ? d.matches.some(
                    (m) =>
                      m.homeTeamId === user.teamId ||
                      m.awayTeamId === user.teamId,
                  )
                : false;
              return (
                <button
                  key={d.day}
                  type="button"
                  className={`cal-day${isSelected ? " is-selected" : ""}${
                    isToday ? " is-today" : ""
                  }`}
                  onClick={() => setSelectedDay(d.day)}
                >
                  <span className="cal-day-num">第 {d.day} 日</span>
                  <span className="cal-day-meta">
                    {d.matches.length} 场
                    {hasMine && <span className="cal-mine">我的</span>}
                  </span>
                  <span className="cal-day-state">
                    {hasFinal ? "已结算" : "待结算"}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* 右侧：选中日的比赛列表 + 回看面板 */}
        <section className="schedule-day panel">
          <div className="panel-head">
            <h2>第 {selectedDay ?? "—"} 日赛程</h2>
            <span className="hint">
              点击已结束比赛可回看 PBP / Box Score
            </span>
          </div>
          <div className="panel-body">
            <div className="day-match-list">
              {selectedDayMatches.length === 0 ? (
                <div className="empty-block">本日无比赛。</div>
              ) : (
                selectedDayMatches.map((m) => {
                  const isMine =
                    user?.teamId &&
                    (m.homeTeamId === user.teamId ||
                      m.awayTeamId === user.teamId);
                  const homeWin =
                    m.status === "final" && m.winnerId === m.homeTeamId;
                  const awayWin =
                    m.status === "final" && m.winnerId === m.awayTeamId;
                  const isReviewing = reviewing?.matchId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`day-match${isMine ? " is-mine" : ""}${
                        isReviewing ? " is-reviewing" : ""
                      }`}
                      onClick={() =>
                        setReviewing({
                          matchId: m.id,
                          homeTeamId: m.homeTeamId,
                          awayTeamId: m.awayTeamId,
                          homeTeamName: m.homeTeamName,
                          awayTeamName: m.awayTeamName,
                        })
                      }
                    >
                      <div className="dm-row">
                        <span
                          className={`dm-name${homeWin ? " win" : ""}${
                            m.homeTeamId === user?.teamId ? " mine" : ""
                          }`}
                        >
                          {m.homeTeamName}
                        </span>
                        <span className="dm-score">
                          {m.homeScore ?? "—"}
                        </span>
                        <span className="dm-vs">:</span>
                        <span className="dm-score">
                          {m.awayScore ?? "—"}
                        </span>
                        <span
                          className={`dm-name${awayWin ? " win" : ""}${
                            m.awayTeamId === user?.teamId ? " mine" : ""
                          }`}
                        >
                          {m.awayTeamName}
                        </span>
                      </div>
                      <div className="dm-status">
                        {m.status === "scheduled" && "未开始"}
                        {m.status === "in_progress" && (
                          <span className="live">进行中</span>
                        )}
                        {m.status === "final" && "已结束 · 点击回看"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* 回看面板 */}
            {reviewing && (
              <div className="review-panel">
                <div className="review-head">
                  <h3>
                    {reviewing.homeTeamName} vs {reviewing.awayTeamName}
                  </h3>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReviewing(null)}
                  >
                    关闭
                  </button>
                </div>
                {simLoading && (
                  <div className="state">
                    <span className="spinner" /> 模拟回看中…
                  </div>
                )}
                {simError && (
                  <div className="match-error">回看失败：{simError}</div>
                )}
                {simOutput && homeTeam && awayTeam && (
                  <ReviewMatch
                    sim={simOutput}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                  />
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReviewMatch({
  sim,
  homeTeam,
  awayTeam,
}: {
  sim: SimOutput;
  homeTeam: TeamDetail;
  awayTeam: TeamDetail;
}) {
  const homeWin = sim.result.winnerId === homeTeam.id;
  return (
    <div className="review-body">
      <div className="review-scoreboard">
        <div className={`rs-side home${homeWin ? " win" : ""}`}>
          <div className="rs-name">{homeTeam.name}</div>
          <div className="rs-score">{sim.boxScore.home.score}</div>
          {homeWin && <span className="rs-badge">胜</span>}
        </div>
        <div className="rs-vs">:</div>
        <div className={`rs-side away${!homeWin ? " win" : ""}`}>
          <div className="rs-name">{awayTeam.name}</div>
          <div className="rs-score">{sim.boxScore.away.score}</div>
          {!homeWin && <span className="rs-badge">胜</span>}
        </div>
      </div>

      <QuarterScoreTable
        homeName={homeTeam.name}
        awayName={awayTeam.name}
        homeScores={sim.quarterScores.home}
        awayScores={sim.quarterScores.away}
        homeTotal={sim.result.homeScore}
        awayTotal={sim.result.awayScore}
      />

      <div className="review-section">
        <h4 className="review-section-title">文字直播</h4>
        <PbpFeed
          events={sim.pbp}
          homeTeamId={homeTeam.id}
          awayTeamId={awayTeam.id}
        />
      </div>

      <div className="review-section">
        <h4 className="review-section-title">技术统计</h4>
        <BoxScoreTable
          homeName={homeTeam.name}
          awayName={awayTeam.name}
          homeStat={sim.boxScore.home}
          awayStat={sim.boxScore.away}
          homePlayers={homeTeam.players}
          awayPlayers={awayTeam.players}
        />
      </div>
    </div>
  );
}
