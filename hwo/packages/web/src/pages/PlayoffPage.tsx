/**
 * PlayoffPage — 季后赛页
 *
 * 参考 Rim Attack 季后赛页：
 *   - 调用 fetchCurrentSeason() 判断当前是否季后赛阶段（status === "playoff"）
 *   - 调用 fetchStandings() 取前 4 名作为季后赛种子（模拟 4 强淘汰赛）
 *   - 调用 fetchSchedule() 筛选季后赛比赛（day > regularSeasonDays），
 *     按系列赛聚合显示当前比分（如 2:1）
 *   - 常规赛阶段显示“季后赛尚未开始”占位，但仍展示当前前 4 名种子预览
 *   - 无实际季后赛数据时，用前端 mock 模拟对阵树（基于积分榜前 4 名）
 *
 * 对阵结构（4 强单败淘汰）：
 *   半决赛：1v4 / 2v3
 *   决赛：  半决赛胜者对决
 *
 * 注：SeasonInfo 未提供 regularSeasonDays 字段，此处按赛程推断——
 * “含有非前 4 名球队比赛的最大 day”作为常规赛末尾日，
 * 其后 day > 该值的、且双方均在前 4 名的比赛视为季后赛。
 */

import { useEffect, useMemo, useState } from "react";
import { fetchCurrentSeason, fetchSchedule, fetchStandings } from "../api";
import type {
  ScheduleDay,
  ScheduleMatch,
  SeasonInfo,
  StandingRow,
} from "../types";
import { useAuth } from "../auth/AuthContext";

const SEED_COUNT = 4;

const SEASON_STATUS_LABEL: Record<string, string> = {
  regular: "常规赛",
  playoff: "季后赛",
  offseason: "休赛期",
};

function seasonStatusLabel(status: string): string {
  return SEASON_STATUS_LABEL[status] ?? status;
}

/** 系列赛聚合：两队之间在季后赛的全部对决 */
interface Series {
  teamIds: [string, string];
  teamNames: [string, string];
  wins: [number, number];
  totalGames: number;
  finalGames: number;
  scheduledGames: number;
  inProgressGames: number;
  decided: boolean;
  winnerId: string | null;
}

function seriesKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** 将季后赛比赛按对阵双方聚合成系列赛 */
function buildSeries(matches: ScheduleMatch[]): Series[] {
  const map = new Map<string, Series>();
  for (const m of matches) {
    const key = seriesKey(m.homeTeamId, m.awayTeamId);
    let s = map.get(key);
    if (!s) {
      s = {
        teamIds: [m.homeTeamId, m.awayTeamId],
        teamNames: [m.homeTeamName, m.awayTeamName],
        wins: [0, 0],
        totalGames: 0,
        finalGames: 0,
        scheduledGames: 0,
        inProgressGames: 0,
        decided: false,
        winnerId: null,
      };
      map.set(key, s);
    }
    s.totalGames++;
    if (m.status === "final") {
      s.finalGames++;
      if (m.winnerId === s.teamIds[0]) s.wins[0]++;
      else if (m.winnerId === s.teamIds[1]) s.wins[1]++;
    } else if (m.status === "scheduled") {
      s.scheduledGames++;
    } else if (m.status === "in_progress") {
      s.inProgressGames++;
    }
  }
  const list: Series[] = [];
  for (const s of map.values()) {
    const allFinal = s.totalGames > 0 && s.finalGames === s.totalGames;
    if (allFinal && s.wins[0] !== s.wins[1]) {
      s.decided = true;
      s.winnerId = s.wins[0] > s.wins[1] ? s.teamIds[0] : s.teamIds[1];
    }
    list.push(s);
  }
  return list;
}

function findSeries(all: Series[], aId: string, bId: string): Series | null {
  const key = seriesKey(aId, bId);
  return (
    all.find((s) => seriesKey(s.teamIds[0], s.teamIds[1]) === key) ?? null
  );
}

export function PlayoffPage() {
  const { user } = useAuth();
  const myTeamId = user?.teamId ?? null;

  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCurrentSeason(), fetchStandings(), fetchSchedule()])
      .then(([s, st, sch]) => {
        if (cancelled) return;
        setSeason(s);
        setStandings(st);
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

  // 取前 4 名种子（按胜率，胜率同则按胜场，再按失分升序）
  const seeds = useMemo<StandingRow[]>(() => {
    if (!standings) return [];
    return [...standings]
      .sort(
        (a, b) =>
          b.winRate - a.winRate || b.wins - a.wins || a.losses - b.losses,
      )
      .slice(0, SEED_COUNT);
  }, [standings]);

  const seedMap = useMemo(() => {
    const m = new Map<string, { row: StandingRow; seed: number }>();
    seeds.forEach((r, i) => m.set(r.teamId, { row: r, seed: i + 1 }));
    return m;
  }, [seeds]);

  // 筛选季后赛比赛：day > regularSeasonDays（regularSeasonDays 由赛程推断）
  const playoffMatches = useMemo<ScheduleMatch[]>(() => {
    if (!schedule || seeds.length < SEED_COUNT) return [];
    const seedIds = new Set(seeds.map((s) => s.teamId));
    // 推断常规赛末尾日：含有非前 4 名球队比赛的最大 day
    let regularSeasonDays = 0;
    for (const d of schedule) {
      const hasNonSeed = d.matches.some(
        (m) => !seedIds.has(m.homeTeamId) || !seedIds.has(m.awayTeamId),
      );
      if (hasNonSeed && d.day > regularSeasonDays) regularSeasonDays = d.day;
    }
    if (regularSeasonDays === 0) return []; // 无法识别常规赛边界，视为无季后赛数据
    const result: ScheduleMatch[] = [];
    for (const d of schedule) {
      if (d.day <= regularSeasonDays) continue;
      for (const m of d.matches) {
        if (seedIds.has(m.homeTeamId) && seedIds.has(m.awayTeamId)) {
          result.push(m);
        }
      }
    }
    return result;
  }, [schedule, seeds]);

  const series = useMemo(() => buildSeries(playoffMatches), [playoffMatches]);

  const isPlayoff = season?.status === "playoff";
  const hasSeriesData = series.length > 0;

  // 对阵槽位（已确保 seeds.length >= 4 时才进入对阵树）
  const semi1A = seeds[0];
  const semi1B = seeds[3];
  const semi2A = seeds[1];
  const semi2B = seeds[2];

  const semi1Series = semi1A
    ? findSeries(series, semi1A.teamId, semi1B?.teamId ?? "")
    : null;
  const semi2Series = semi2A
    ? findSeries(series, semi2A.teamId, semi2B?.teamId ?? "")
    : null;

  const semi1WinnerId = semi1Series?.decided ? semi1Series.winnerId : null;
  const semi2WinnerId = semi2Series?.decided ? semi2Series.winnerId : null;

  const finalSeries =
    semi1WinnerId && semi2WinnerId
      ? findSeries(series, semi1WinnerId, semi2WinnerId)
      : null;
  const championId = finalSeries?.decided ? finalSeries.winnerId : null;

  function seedOf(teamId: string): number | null {
    return seedMap.get(teamId)?.seed ?? null;
  }
  function nameOf(teamId: string | null): string {
    if (!teamId) return "待定";
    return seedMap.get(teamId)?.row.teamName ?? teamId;
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 正在加载季后赛…
      </div>
    );
  }
  if (error) {
    return <div className="state error">季后赛加载失败：{error}</div>;
  }

  const bannerText = isPlayoff
    ? hasSeriesData
      ? "季后赛进行中"
      : "季后赛进行中 · 系列赛数据尚未生成，以下为对阵预览"
    : "季后赛尚未开始 · 以下为当前前 4 名种子预览";
  const bannerMod = isPlayoff && hasSeriesData ? "" : " is-preview";

  return (
    <div className="playoff-page">
      <div className="playoff-page-head">
        <h1>季后赛</h1>
        {season && (
          <span className="playoff-page-sub">
            {season.name} · {season.year} · {seasonStatusLabel(season.status)}
          </span>
        )}
      </div>

      <div className={`playoff-banner${bannerMod}`}>{bannerText}</div>

      {seeds.length < SEED_COUNT ? (
        <div className="empty-block">
          积分榜球队不足 4 支，暂无法生成季后赛对阵树。
        </div>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>对阵树</h2>
            <span className="hint">4 强单败淘汰 · 半决赛 1v4 / 2v3</span>
          </div>
          <div className="panel-body">
            <div className="playoff-bracket">
              {/* 半决赛 */}
              <div className="bracket-round bracket-round-semis">
                <div className="bracket-round-title">半决赛</div>
                <div className="bracket-pair">
                  <BracketMatch
                    label="1 vs 4"
                    aId={semi1A!.teamId}
                    aName={semi1A!.teamName}
                    aSeed={1}
                    bId={semi1B!.teamId}
                    bName={semi1B!.teamName}
                    bSeed={4}
                    series={semi1Series}
                    myTeamId={myTeamId}
                  />
                  <BracketMatch
                    label="2 vs 3"
                    aId={semi2A!.teamId}
                    aName={semi2A!.teamName}
                    aSeed={2}
                    bId={semi2B!.teamId}
                    bName={semi2B!.teamName}
                    bSeed={3}
                    series={semi2Series}
                    myTeamId={myTeamId}
                  />
                </div>
              </div>

              {/* 决赛 */}
              <div className="bracket-round bracket-round-final">
                <div className="bracket-round-title">决赛</div>
                <BracketMatch
                  label="半决赛胜者"
                  aId={semi1WinnerId}
                  aName={nameOf(semi1WinnerId)}
                  bId={semi2WinnerId}
                  bName={nameOf(semi2WinnerId)}
                  series={finalSeries}
                  myTeamId={myTeamId}
                  hideSeed
                />
              </div>

              {/* 决赛 → 冠军 连接线（显式 .bracket-line） */}
              <span
                className="bracket-line bracket-line-h bracket-line-to-champ"
                aria-hidden="true"
              />

              {/* 冠军 */}
              <div className="bracket-round bracket-round-champion">
                <div className="bracket-round-title">冠军</div>
                <div
                  className={`bracket-champion${
                    championId ? " is-crowned" : ""
                  }`}
                >
                  <span className="bracket-trophy">🏆</span>
                  <span className="bracket-champion-name">
                    {championId ? nameOf(championId) : "待定"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 系列赛比分明细 */}
      {hasSeriesData && (
        <section className="panel">
          <div className="panel-head">
            <h2>系列赛比分</h2>
            <span className="hint">按当前已结算场次统计</span>
          </div>
          <div className="panel-body">
            <div className="playoff-series-list">
              {series.map((s) => {
                const seedA = seedOf(s.teamIds[0]);
                const seedB = seedOf(s.teamIds[1]);
                const isMineA = s.teamIds[0] === myTeamId;
                const isMineB = s.teamIds[1] === myTeamId;
                return (
                  <div
                    className="playoff-series-item"
                    key={`${s.teamIds[0]}-${s.teamIds[1]}`}
                  >
                    <div className={`ps-team${isMineA ? " is-mine" : ""}`}>
                      {seedA != null && (
                        <span className="ps-seed">#{seedA}</span>
                      )}
                      <span className="ps-name">{s.teamNames[0]}</span>
                      <span className="ps-wins">{s.wins[0]}</span>
                    </div>
                    <span className="ps-colon">:</span>
                    <div className={`ps-team${isMineB ? " is-mine" : ""}`}>
                      <span className="ps-wins">{s.wins[1]}</span>
                      <span className="ps-name">{s.teamNames[1]}</span>
                      {seedB != null && (
                        <span className="ps-seed">#{seedB}</span>
                      )}
                    </div>
                    <span className="ps-meta">
                      {s.decided
                        ? `已决出 · ${s.finalGames} 场`
                        : s.inProgressGames > 0
                          ? "进行中"
                          : `${s.scheduledGames} 场待赛`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ── 对阵卡 ──

interface BracketMatchProps {
  label: string;
  aId: string | null;
  aName: string;
  bId: string | null;
  bName: string;
  aSeed?: number;
  bSeed?: number;
  series: Series | null;
  myTeamId: string | null;
  hideSeed?: boolean;
}

function BracketMatch({
  label,
  aId,
  aName,
  bId,
  bName,
  aSeed,
  bSeed,
  series,
  myTeamId,
  hideSeed,
}: BracketMatchProps) {
  // 系列赛比分（若有）：按 aId / bId 在 series 中定位胜场，避免顺序错位
  const aWins =
    series && aId
      ? series.teamIds[0] === aId
        ? series.wins[0]
        : series.teamIds[1] === aId
          ? series.wins[1]
          : 0
      : 0;
  const bWins =
    series && bId
      ? series.teamIds[0] === bId
        ? series.wins[0]
        : series.teamIds[1] === bId
          ? series.wins[1]
          : 0
      : 0;
  const hasScore = series != null && series.totalGames > 0;
  const aWinner = series?.decided ? series.winnerId === aId : false;
  const bWinner = series?.decided ? series.winnerId === bId : false;
  const aIsMine = aId != null && aId === myTeamId;
  const bIsMine = bId != null && bId === myTeamId;

  return (
    <div className="bracket-match">
      <div className="bracket-match-label">{label}</div>
      <div
        className={`bracket-team${aWinner ? " is-winner" : ""}${
          hasScore && !aWinner ? " is-loser" : ""
        }`}
      >
        {!hideSeed && aSeed != null && (
          <span className="bt-seed">{aSeed}</span>
        )}
        <span className={`bt-name${aIsMine ? " is-mine" : ""}`}>{aName}</span>
        {hasScore ? (
          <span className="bt-score">{aWins}</span>
        ) : (
          <span className="bt-score is-empty">—</span>
        )}
      </div>
      <div
        className={`bracket-team${bWinner ? " is-winner" : ""}${
          hasScore && !bWinner ? " is-loser" : ""
        }`}
      >
        {!hideSeed && bSeed != null && (
          <span className="bt-seed">{bSeed}</span>
        )}
        <span className={`bt-name${bIsMine ? " is-mine" : ""}`}>{bName}</span>
        {hasScore ? (
          <span className="bt-score">{bWins}</span>
        ) : (
          <span className="bt-score is-empty">—</span>
        )}
      </div>
    </div>
  );
}
