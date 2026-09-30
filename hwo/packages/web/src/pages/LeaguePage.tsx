/**
 * LeaguePage — 联赛资讯页
 *
 * 参考 Rim Attack 的联赛资讯页：
 *   - 积分榜 tab：完整积分榜表格，高亮我的球队
 *   - 数据榜 tab：得分榜 / 篮板榜 / 助攻榜 Top 10
 *   - 赛季信息 tab：当前赛季概况 + 赛程概要
 *
 * 数据来源：
 *   - fetchStandings()        → 积分榜
 *   - fetchTeams()            → 全部球队阵容（含 ovr，用于得分榜，覆盖所有球队）
 *   - fetchTeam(id) (前 3 队) → 球员能力值（含 abilities，用于篮板/助攻榜）
 *     注：fetchTeam 需逐个调用，限制只取前 3 支球队以避免过多请求。
 *   - fetchCurrentSeason()    → 赛季信息
 *   - fetchSchedule()         → 赛程概要（总场次 / 已完成 / 剩余）
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchCurrentSeason,
  fetchSchedule,
  fetchStandings,
  fetchTeam,
  fetchTeams,
} from "../api";
import { ovrVal } from "../lib";
import type {
  Abilities,
  Position,
  ScheduleDay,
  SeasonInfo,
  StandingRow,
  TeamRoster,
} from "../types";
import { POSITION_LABEL } from "../lib";
import { useAuth } from "../auth/AuthContext";

interface Props {
  /** 可选：用于高亮积分榜中的我的球队；缺省时取 useAuth() 的 user.teamId */
  teamId?: string;
}

type LeagueTab = "standings" | "leaders" | "season";
type LeaderKind = "scoring" | "rebound" | "assist";

/** 数据榜条目：球员 + 所属球队 + 能力值（abilities 仅前 3 队有） */
interface LeaderEntry {
  playerId: string;
  playerName: string;
  position: Position;
  teamId: string;
  teamName: string;
  ovr: number;
  abilities?: Abilities;
}

/** 篮板能力代理值：Abilities 无独立 rebounding 字段，按弹跳/力量/内线防守合成。 */
function reboundProxy(a: Abilities): number {
  return Math.round((a.jumping + a.strength + a.interiorD) / 3);
}

const SEASON_STATUS_LABEL: Record<string, string> = {
  regular: "常规赛",
  playoff: "季后赛",
  offseason: "休赛期",
};

function seasonStatusLabel(status: string): string {
  return SEASON_STATUS_LABEL[status] ?? status;
}

export function LeaguePage({ teamId }: Props) {
  const { user } = useAuth();
  const myTeamId = teamId ?? user?.teamId ?? null;
  const [tab, setTab] = useState<LeagueTab>("standings");

  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [teams, setTeams] = useState<TeamRoster[] | null>(null);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [leaderEntries, setLeaderEntries] = useState<LeaderEntry[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 主数据加载（积分榜 / 球队 / 赛季 / 赛程 并行）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchStandings(),
      fetchTeams(),
      fetchCurrentSeason(),
      fetchSchedule(),
    ])
      .then(([st, ts, se, sch]) => {
        if (cancelled) return;
        setStandings(st);
        setTeams(ts);
        setSeason(se);
        setSchedule(sch);
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

  // 数据榜：取前 3 支球队的详情（含 abilities），用于篮板/助攻榜
  useEffect(() => {
    if (!teams || teams.length === 0) return;
    let cancelled = false;
    setLeadersLoading(true);
    const top3 = teams.slice(0, 3);
    Promise.all(top3.map((t) => fetchTeam(t.id)))
      .then((details) => {
        if (cancelled) return;
        const entries: LeaderEntry[] = [];
        for (const detail of details) {
          for (const p of detail.players) {
            entries.push({
              playerId: p.id,
              playerName: p.name,
              position: p.position,
              teamId: detail.id,
              teamName: detail.name,
              ovr: ovrVal(p.ovr),
              abilities: p.abilities as Abilities,
            });
          }
        }
        setLeaderEntries(entries);
      })
      .catch(() => {
        // 数据榜非关键路径，失败不阻塞页面
        if (!cancelled) setLeaderEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLeadersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teams]);

  // 得分榜：覆盖全部球队，按 ovr 排序（来自 fetchTeams）
  const scoringLeaders = useMemo<LeaderEntry[]>(() => {
    if (!teams) return [];
    const all: LeaderEntry[] = [];
    for (const t of teams) {
      for (const p of t.players) {
        all.push({
          playerId: p.id,
          playerName: p.name,
          position: p.position,
          teamId: t.id,
          teamName: t.name,
          ovr: ovrVal(p.ovr),
        });
      }
    }
    return all.sort((a, b) => b.ovr - a.ovr).slice(0, 10);
  }, [teams]);

  // 篮板榜：前 3 队球员按篮板能力代理值排序
  const reboundLeaders = useMemo<LeaderEntry[]>(() => {
    return leaderEntries
      .filter((e) => e.abilities)
      .sort((a, b) => reboundProxy(b.abilities!) - reboundProxy(a.abilities!))
      .slice(0, 10);
  }, [leaderEntries]);

  // 助攻榜：前 3 队球员按 passing 排序
  const assistLeaders = useMemo<LeaderEntry[]>(() => {
    return leaderEntries
      .filter((e) => e.abilities)
      .sort((a, b) => b.abilities!.passing - a.abilities!.passing)
      .slice(0, 10);
  }, [leaderEntries]);

  // 赛程概要
  const scheduleSummary = useMemo(() => {
    if (!schedule) return null;
    let total = 0;
    let done = 0;
    for (const d of schedule) {
      for (const m of d.matches) {
        total++;
        if (m.status === "final") done++;
      }
    }
    return { total, done, remaining: total - done };
  }, [schedule]);

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 正在加载联赛资讯…
      </div>
    );
  }
  if (error) {
    return <div className="state error">联赛资讯加载失败：{error}</div>;
  }

  return (
    <div className="league-page">
      <div className="league-page-head">
        <h1>联赛资讯</h1>
        {season && (
          <span className="league-page-sub">
            {season.name} · {season.year}
          </span>
        )}
      </div>

      <div className="tab-nav league-tabs">
        <button
          type="button"
          className={`tab${tab === "standings" ? " is-active" : ""}`}
          onClick={() => setTab("standings")}
        >
          积分榜
        </button>
        <button
          type="button"
          className={`tab${tab === "leaders" ? " is-active" : ""}`}
          onClick={() => setTab("leaders")}
        >
          数据榜
        </button>
        <button
          type="button"
          className={`tab${tab === "season" ? " is-active" : ""}`}
          onClick={() => setTab("season")}
        >
          赛季信息
        </button>
      </div>

      {tab === "standings" && (
        <StandingsPanel rows={standings ?? []} myTeamId={myTeamId} />
      )}
      {tab === "leaders" && (
        <LeadersPanel
          scoring={scoringLeaders}
          rebound={reboundLeaders}
          assist={assistLeaders}
          loading={leadersLoading}
        />
      )}
      {tab === "season" && (
        <SeasonPanel season={season} summary={scheduleSummary} />
      )}
    </div>
  );
}

// ── 积分榜面板 ──

function StandingsPanel({
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
    <section className="panel">
      <div className="panel-head">
        <h2>积分榜</h2>
        <span className="hint">按胜率排序，高亮我的球队</span>
      </div>
      <div className="panel-body">
        <table className="standings-table league-standings-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-team">球队</th>
              <th>胜</th>
              <th>负</th>
              <th>胜率</th>
              <th>得分</th>
              <th>失分</th>
              <th>净胜分</th>
              <th>近况</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isMine = r.teamId === myTeamId;
              const diff = r.pointsFor - r.pointsAgainst;
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
                  <td
                    className={
                      diff > 0 ? "diff-pos" : diff < 0 ? "diff-neg" : ""
                    }
                  >
                    {diff > 0 ? `+${diff}` : diff}
                  </td>
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
      </div>
    </section>
  );
}

// ── 数据榜面板 ──

function LeadersPanel({
  scoring,
  rebound,
  assist,
  loading,
}: {
  scoring: LeaderEntry[];
  rebound: LeaderEntry[];
  assist: LeaderEntry[];
  loading: boolean;
}) {
  const [kind, setKind] = useState<LeaderKind>("scoring");
  const list = kind === "scoring" ? scoring : kind === "rebound" ? rebound : assist;
  const statLabel =
    kind === "scoring" ? "OVR" : kind === "rebound" ? "篮板" : "助攻";
  const note =
    kind === "scoring"
      ? "覆盖全部球队，按综合能力值（OVR）排序"
      : "仅统计前 3 支球队（受 API 逐队拉取限制）";

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>联盟数据榜</h2>
        <span className="hint">Top 10</span>
      </div>
      <div className="panel-body">
        <div className="tab-nav stat-leader-tabs">
          <button
            type="button"
            className={`tab${kind === "scoring" ? " is-active" : ""}`}
            onClick={() => setKind("scoring")}
          >
            得分榜
          </button>
          <button
            type="button"
            className={`tab${kind === "rebound" ? " is-active" : ""}`}
            onClick={() => setKind("rebound")}
          >
            篮板榜
          </button>
          <button
            type="button"
            className={`tab${kind === "assist" ? " is-active" : ""}`}
            onClick={() => setKind("assist")}
          >
            助攻榜
          </button>
        </div>

        {loading ? (
          <div className="state">
            <span className="spinner" /> 正在加载数据榜…
          </div>
        ) : list.length === 0 ? (
          <div className="empty-block">暂无数据。</div>
        ) : (
          <>
            <p className="stat-leader-note">{note}</p>
            <table className="stat-leaders">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th className="col-player">球员</th>
                  <th>位置</th>
                  <th className="col-team-cell">球队</th>
                  <th>{statLabel}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e, i) => {
                  const value =
                    kind === "scoring"
                      ? e.ovr
                      : kind === "rebound"
                        ? reboundProxy(e.abilities!)
                        : e.abilities!.passing;
                  return (
                    <tr key={`${e.playerId}-${i}`}>
                      <td className="col-rank">{i + 1}</td>
                      <td className="col-player">{e.playerName}</td>
                      <td>{POSITION_LABEL[e.position] ?? e.position}</td>
                      <td className="col-team-cell">{e.teamName}</td>
                      <td className="stat-value">{value}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}

// ── 赛季信息面板 ──

function SeasonPanel({
  season,
  summary,
}: {
  season: SeasonInfo | null;
  summary: { total: number; done: number; remaining: number } | null;
}) {
  if (!season) {
    return <div className="empty-block">暂无赛季信息。</div>;
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>赛季信息</h2>
        <span className="hint">{seasonStatusLabel(season.status)}</span>
      </div>
      <div className="panel-body">
        <div className="season-info-grid">
          <div className="season-info-item">
            <span className="si-label">赛季名</span>
            <span className="si-value">{season.name}</span>
          </div>
          <div className="season-info-item">
            <span className="si-label">年份</span>
            <span className="si-value">{season.year}</span>
          </div>
          <div className="season-info-item">
            <span className="si-label">状态</span>
            <span className="si-value">
              {seasonStatusLabel(season.status)}
            </span>
          </div>
          <div className="season-info-item">
            <span className="si-label">当前日</span>
            <span className="si-value">第 {season.currentDay} 日</span>
          </div>
          {summary && (
            <div className="season-info-item season-info-wide">
              <span className="si-label">赛程概要</span>
              <span className="si-value">
                共 {summary.total} 场 · 已完成 {summary.done} 场 · 剩余{" "}
                {summary.remaining} 场
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
