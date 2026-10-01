/**
 * ArenaPage — 竞技场 PvP 页
 *
 * 参考 Rim Attack 竞技场，提供两类 PvP 玩法：
 *   - 友好对战：从全部球队中挑选对手（排除自己），点击"挑战"模拟一场比赛
 *   - 排位赛：前端 mock 排位积分（localStorage 持久化）、赛季信息与排行榜，
 *     "开始匹配"后模拟一场比赛并根据胜负调整积分
 *   - 球馆设施：训练馆 / 主场馆升级，影响训练成长与比赛日营收（P2-3）
 *
 * 对接：
 *   GET  /api/teams   → TeamRoster[]（对手列表）
 *   GET  /api/tactics → TacticPreset[]（取首个作为默认战术，与赛程页一致）
 *   POST /api/sim/match → SimOutput
 *   GET  /api/facility/:teamId → Facility
 *   POST /api/facility/:teamId/upgrade → Facility
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFacility, fetchTactics, fetchTeams, postSimMatch, postUpgradeFacility } from "../api";
import type { Facility, FacilityType, SimOutput, TacticPreset, TeamRoster } from "../types";
import { useAuth } from "../auth/AuthContext";
import { ovrVal } from "../lib";

interface Props {
  teamId?: string;
}

type Tab = "friendly" | "ranked" | "facility";

const RANK_KEY = "hwo_arena_rank";
const RANK_BASE = 1000;
const RANK_WIN = 25;
const RANK_LOSS = 20;

const SEASON_NAME = "S1 起源赛季";
const SEASON_DAYS_LEFT = 18;

const RIVAL_NAMES = [
  "KingRim",
  "HoopsMaster",
  "DunkLord",
  "ThreeBall",
  "CourtGiant",
  "NetHunter",
  "FastBreak",
  "PickRoll",
  "BoxOut",
  "ClutchShot",
];

interface MatchSummary {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  won: boolean;
  clutch: boolean;
  /** 排位积分变化（仅排位赛） */
  delta?: number;
}

interface RankedEntry {
  rank: number;
  name: string;
  score: number;
  me: boolean;
}

/** 读取排位积分；无存储环境回退初始分 */
function readRank(): number {
  try {
    const raw = localStorage.getItem(RANK_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    // ignore
  }
  return RANK_BASE;
}

function writeRank(v: number): void {
  try {
    localStorage.setItem(RANK_KEY, String(Math.max(0, Math.round(v))));
  } catch {
    // ignore
  }
}

/** 由球队 id 哈希生成稳定的 mock 战绩 */
function mockRecord(teamId: string): { wins: number; losses: number } {
  let h = 0;
  for (let i = 0; i < teamId.length; i++)
    h = (h * 31 + teamId.charCodeAt(i)) >>> 0;
  return { wins: 8 + (h % 15), losses: 6 + ((h >> 4) % 14) };
}

/** 球队平均 OVR */
function teamOvr(team: TeamRoster): number {
  if (!team.players.length) return 0;
  const sum = team.players.reduce((s, p) => s + ovrVal(p.ovr), 0);
  return Math.round(sum / team.players.length);
}

/** OVR 等级色（与全局主题一致） */
function ovrTier(ovr: number): string {
  if (ovr >= 90) return "var(--gold)";
  if (ovr >= 80) return "var(--purple)";
  if (ovr >= 70) return "var(--blue-tier)";
  return "var(--gray-tier)";
}

export function ArenaPage({ teamId }: Props) {
  const { user } = useAuth();
  const myTeamId = teamId ?? user?.teamId ?? undefined;

  const [tab, setTab] = useState<Tab>("friendly");
  const [teams, setTeams] = useState<TeamRoster[]>([]);
  const [tactics, setTactics] = useState<TacticPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 友好对战：每个对手的模拟状态与结果
  const [busyId, setBusyId] = useState<string | null>(null);
  const [friendlyResult, setFriendlyResult] = useState<MatchSummary | null>(
    null,
  );

  // 排位赛状态：lazy init from localStorage，避免额外渲染
  const [rank, setRank] = useState<number>(() => readRank());
  const [matchmaking, setMatchmaking] = useState(false);
  const [rankedResult, setRankedResult] = useState<MatchSummary | null>(null);

  // P2-3: 球馆设施状态
  const [facility, setFacility] = useState<Facility | null>(null);
  const [upgrading, setUpgrading] = useState<FacilityType | null>(null);
  const [facilityError, setFacilityError] = useState<string | null>(null);

  // 取首个战术作为默认（与赛程页一致，回退 "pace_space"）
  const defaultTacticId = tactics[0]?.id ?? "pace_space";

  const load = useCallback(() => {
    if (!myTeamId) {
      setLoading(false);
      setError("未关联球队，无法进入竞技场");
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([fetchTeams(), fetchTactics(), fetchFacility(myTeamId).catch(() => null)])
      .then(([ts, tcs, fac]) => {
        setTeams(ts);
        setTactics(tcs);
        if (fac) setFacility(fac);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [myTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  // 对手列表：排除自己，附 OVR 与 mock 战绩，按 OVR 降序
  const opponents = useMemo(
    () =>
      teams
        .filter((t) => t.id !== myTeamId)
        .map((t) => ({ team: t, ovr: teamOvr(t), record: mockRecord(t.id) }))
        .sort((a, b) => b.ovr - a.ovr),
    [teams, myTeamId],
  );

  const myTeam = teams.find((t) => t.id === myTeamId);

  // 排行榜：围绕玩家积分 mock，memo 避免重渲染抖动
  const leaderboard = useMemo<RankedEntry[]>(() => {
    const rows: RankedEntry[] = RIVAL_NAMES.map((name, i) => {
      const offset = (RIVAL_NAMES.length - i) * 12 + (i % 2 === 0 ? 5 : -3);
      return { rank: 0, name, score: rank + offset, me: false };
    });
    rows.push({ rank: 0, name: "我", score: rank, me: true });
    rows.sort((a, b) => b.score - a.score);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rank]);

  /** 模拟一场比赛并汇总结果（默认双方使用同一战术预设） */
  const simulate = async (
    homeId: string,
    awayId: string,
  ): Promise<MatchSummary> => {
    const out: SimOutput = await postSimMatch({
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeTacticId: defaultTacticId,
      awayTacticId: defaultTacticId,
    });
    const homeName = teams.find((t) => t.id === homeId)?.name ?? homeId;
    const awayName = teams.find((t) => t.id === awayId)?.name ?? awayId;
    return {
      homeName,
      awayName,
      homeScore: out.result.homeScore,
      awayScore: out.result.awayScore,
      won: out.result.winnerId === homeId,
      clutch: out.result.isClutch,
    };
  };

  /** 友好对战：挑战指定对手 */
  const handleChallenge = async (opponentId: string) => {
    if (!myTeamId || busyId) return;
    setError(null);
    setFriendlyResult(null);
    setBusyId(opponentId);
    try {
      const summary = await simulate(myTeamId, opponentId);
      setFriendlyResult(summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  /** 排位赛：开始匹配（mock 延迟后模拟一场比赛并调整积分） */
  const handleRankedMatch = async () => {
    if (!myTeamId || matchmaking || opponents.length === 0) return;
    setError(null);
    setRankedResult(null);
    setMatchmaking(true);
    // mock 匹配延迟
    await new Promise((r) => setTimeout(r, 900));
    const opponent = opponents[Math.floor(Math.random() * opponents.length)];
    try {
      const summary = await simulate(myTeamId, opponent.team.id);
      const delta = summary.won ? RANK_WIN : -RANK_LOSS;
      const next = Math.max(0, rank + delta);
      setRank(next);
      writeRank(next);
      setRankedResult({ ...summary, delta: next - rank });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMatchmaking(false);
    }
  };

  /** P2-3: 升级球馆设施（消耗 Coins，由后端扣款） */
  const handleUpgradeFacility = async (type: FacilityType) => {
    if (!myTeamId || upgrading) return;
    setFacilityError(null);
    setUpgrading(type);
    try {
      const updated = await postUpgradeFacility(myTeamId, type);
      setFacility(updated);
    } catch (e: unknown) {
      setFacilityError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpgrading(null);
    }
  };

  if (loading) {
    return (
      <div className="arena-page">
        <div className="page-head">
          <h2>竞技场</h2>
        </div>
        <div className="state">
          <span className="spinner" /> 正在加载竞技场数据…
        </div>
      </div>
    );
  }

  if (error && teams.length === 0) {
    return (
      <div className="arena-page">
        <div className="page-head">
          <h2>竞技场</h2>
        </div>
        <div className="state error">{error}</div>
      </div>
    );
  }

  return (
    <div className="arena-page">
      <div className="page-head">
        <h2>竞技场 PvP</h2>
        <p className="muted">挑战其他球队，或在排位赛中争夺荣耀</p>
      </div>

      {error && <div className="state error">{error}</div>}

      <div className="arena-tabs">
        {(["friendly", "ranked", "facility"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`arena-tab${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "friendly" ? "友好对战" : t === "ranked" ? "排位赛" : "球馆设施"}
          </button>
        ))}
      </div>

      {tab === "friendly" && (
        <section className="panel">
          <div className="panel-head">
            <h2>对手列表</h2>
            <span className="hint">
              {myTeam
                ? `我方：${myTeam.name} · OVR ${teamOvr(myTeam)}`
                : "—"}
            </span>
          </div>
          <div className="panel-body">
            {opponents.length === 0 ? (
              <div className="empty-block">暂无可挑战的对手</div>
            ) : (
              <div className="opponent-grid">
                {opponents.map(({ team, ovr, record }) => {
                  const busy = busyId === team.id;
                  return (
                    <div key={team.id} className="opponent-card">
                      <div className="opponent-card-head">
                        <span className="opponent-name">{team.name}</span>
                        <span
                          className="opponent-ovr"
                          style={{ color: ovrTier(ovr) }}
                        >
                          {ovr}
                        </span>
                      </div>
                      <div className="opponent-record">
                        <span>战绩</span>
                        <strong>
                          {record.wins} 胜 {record.losses} 负
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleChallenge(team.id)}
                        disabled={!!busyId}
                      >
                        {busy ? "模拟中…" : "挑战"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {friendlyResult && (
              <div className="arena-result">
                <div className="arena-result-title">
                  {friendlyResult.won ? "胜利" : "失利"}
                  {friendlyResult.clutch && " · 险胜"}
                </div>
                <div className="arena-result-score">
                  <span className={friendlyResult.won ? "is-win" : ""}>
                    {friendlyResult.homeName} {friendlyResult.homeScore}
                  </span>
                  <span className="vs">:</span>
                  <span className={friendlyResult.won ? "" : "is-win"}>
                    {friendlyResult.awayScore} {friendlyResult.awayName}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "ranked" && (
        <div className="ranked-layout">
          <section className="panel rank-panel">
            <div className="panel-head">
              <h2>排位信息</h2>
              <span className="hint">{SEASON_NAME}</span>
            </div>
            <div className="panel-body">
              <div className="rank-score-box">
                <span className="rank-score-label">当前积分</span>
                <span className="rank-score-value">{rank}</span>
              </div>
              <div className="rank-season">
                <span>赛季：{SEASON_NAME}</span>
                <span>剩余 {SEASON_DAYS_LEFT} 天</span>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRankedMatch}
                disabled={matchmaking || opponents.length === 0}
              >
                {matchmaking ? "匹配中…" : "开始匹配"}
              </button>
              {rankedResult && (
                <div className="arena-result">
                  <div className="arena-result-title">
                    {rankedResult.won ? "胜利" : "失利"} · 积分{" "}
                    {(rankedResult.delta ?? 0) > 0 ? "+" : ""}
                    {rankedResult.delta ?? 0}
                    {rankedResult.clutch && " · 险胜"}
                  </div>
                  <div className="arena-result-score">
                    <span className={rankedResult.won ? "is-win" : ""}>
                      {rankedResult.homeName} {rankedResult.homeScore}
                    </span>
                    <span className="vs">:</span>
                    <span className={rankedResult.won ? "" : "is-win"}>
                      {rankedResult.awayScore} {rankedResult.awayName}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>排行榜</h2>
              <span className="hint">前 {leaderboard.length} 名</span>
            </div>
            <div className="panel-body">
              <ul className="rank-list">
                {leaderboard.map((e) => (
                  <li
                    key={e.rank}
                    className={`rank-row${e.me ? " is-me" : ""}`}
                  >
                    <span className="rank-no">{e.rank}</span>
                    <span className="rank-name">{e.name}</span>
                    <span className="rank-score">{e.score}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}

      {tab === "facility" && (
        <section className="panel">
          <div className="panel-head">
            <h2>球馆设施</h2>
            <span className="hint">
              {myTeam ? `我方：${myTeam.name}` : "—"}
            </span>
          </div>
          <div className="panel-body">
            {facilityError && (
              <div className="state error">{facilityError}</div>
            )}
            {!facility ? (
              <div className="empty-block">暂无球馆设施数据</div>
            ) : (
              <div className="facility-grid">
                <FacilityCard
                  title="训练馆"
                  level={facility.trainingHallLv}
                  effects={[
                    {
                      label: "训练成长倍率",
                      value: `×${facility.trainingMultiplier.toFixed(2)}`,
                    },
                  ]}
                  next={
                    facility.upgrades.trainingHall.cost != null
                      ? {
                          cost: facility.upgrades.trainingHall.cost,
                          nextLabel:
                            facility.upgrades.trainingHall.nextMultiplier != null
                              ? `×${facility.upgrades.trainingHall.nextMultiplier.toFixed(2)}`
                              : null,
                        }
                      : null
                  }
                  upgrading={upgrading === "trainingHall"}
                  onUpgrade={() => handleUpgradeFacility("trainingHall")}
                />
                <FacilityCard
                  title="主场馆"
                  level={facility.arenaLv}
                  effects={[
                    {
                      label: "比赛日营收倍率",
                      value: `×${facility.arenaRevenueMultiplier.toFixed(2)}`,
                    },
                    {
                      label: "主场优势加成",
                      value:
                        facility.homeAdvantageBonus > 0
                          ? `+${facility.homeAdvantageBonus.toFixed(1)}`
                          : "—",
                    },
                  ]}
                  next={
                    facility.upgrades.arena.cost != null
                      ? {
                          cost: facility.upgrades.arena.cost,
                          nextLabel:
                            facility.upgrades.arena.nextRevenue != null
                              ? `×${facility.upgrades.arena.nextRevenue.toFixed(2)}`
                              : null,
                        }
                      : null
                  }
                  upgrading={upgrading === "arena"}
                  onUpgrade={() => handleUpgradeFacility("arena")}
                />
              </div>
            )}
            <p className="muted facility-tip">
              训练馆等级越高，手动训练属性成长越快；主场馆等级越高，比赛日门票营收与主场判罚优势越强。
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── P2-3: 球馆设施卡片 ───

interface FacilityCardProps {
  title: string;
  level: number;
  effects: { label: string; value: string }[];
  next: { cost: number; nextLabel: string | null } | null;
  upgrading: boolean;
  onUpgrade: () => void;
}

function FacilityCard({
  title,
  level,
  effects,
  next,
  upgrading,
  onUpgrade,
}: FacilityCardProps) {
  return (
    <div className="facility-card">
      <div className="facility-card-head">
        <span className="facility-name">{title}</span>
        <span className="facility-level">Lv {level}</span>
      </div>
      <div className="facility-effects">
        {effects.map((e) => (
          <div key={e.label} className="facility-effect-row">
            <span>{e.label}</span>
            <strong>{e.value}</strong>
          </div>
        ))}
      </div>
      <div className="facility-upgrade">
        {next ? (
          <>
            <div className="facility-upgrade-info">
              <span>下一级</span>
              <strong>
                {next.nextLabel ?? "已封顶"}
              </strong>
              <span className="facility-cost">
                花费 {next.cost.toLocaleString()} Coins
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onUpgrade}
              disabled={upgrading}
            >
              {upgrading ? "升级中…" : "升级"}
            </button>
          </>
        ) : (
          <div className="facility-maxed">已满级</div>
        )}
      </div>
    </div>
  );
}
