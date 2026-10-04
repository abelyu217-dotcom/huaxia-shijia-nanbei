/**
 * PlayoffPage — 季后赛对阵树
 *
 * 调用 GET /api/season/playoff 获取真实对阵树数据，
 * 按轮次（round）渲染对阵列，展示球队、种子、系列赛比分与晋级状态。
 */

import { useEffect, useMemo, useState } from "react";
import { fetchCurrentSeason, fetchPlayoff } from "../api";
import type { PlayoffBracket, PlayoffSeriesInfo } from "../api";
import type { SeasonInfo } from "../types";
import { useAuth } from "../auth/AuthContext";

const SEASON_STATUS_LABEL: Record<string, string> = {
  regular: "常规赛",
  playoff: "季后赛",
  offseason: "休赛期",
};

const ROUND_LABEL: Record<number, string> = {
  1: "首轮",
  2: "次轮",
  3: "半决赛",
  4: "决赛",
};

function roundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return "决赛";
  if (round === totalRounds - 1) return "半决赛";
  if (ROUND_LABEL[round]) return ROUND_LABEL[round];
  return `第 ${round} 轮`;
}

function seasonStatusLabel(status: string): string {
  return SEASON_STATUS_LABEL[status] ?? status;
}

export function PlayoffPage() {
  const { user } = useAuth();
  const myTeamId = user?.teamId ?? null;

  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [bracket, setBracket] = useState<PlayoffBracket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCurrentSeason(), fetchPlayoff().catch(() => null)])
      .then(([s, b]) => {
        if (cancelled) return;
        setSeason(s);
        setBracket(b);
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

  // 按轮次分组系列赛
  const rounds = useMemo(() => {
    if (!bracket) return [];
    const map = new Map<number, PlayoffSeriesInfo[]>();
    for (const s of bracket.series) {
      if (!map.has(s.round)) map.set(s.round, []);
      map.get(s.round)!.push(s);
    }
    const keys = [...map.keys()].sort((a, b) => a - b);
    return keys.map((r) => ({
      round: r,
      label: roundLabel(r, bracket.totalRounds),
      series: map.get(r)!.sort((a, b) => a.slot - b.slot),
    }));
  }, [bracket]);

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

  const isPlayoff = season?.status === "playoff";
  const hasBracket = bracket != null && bracket.series.length > 0;

  const bannerText = !hasBracket
    ? "季后赛尚未开始 · 常规赛结束后自动生成对阵树"
    : bracket!.championName
      ? `赛季结束 · ${bracket!.championName} 夺冠`
      : isPlayoff
        ? "季后赛进行中"
        : "季后赛对阵已生成";
  const bannerMod = !hasBracket ? " is-preview" : "";

  return (
    <div className="playoff-page">
      <div className="playoff-page-head">
        <h1>季后赛</h1>
        {season && (
          <span className="playoff-page-sub">
            {season.name} · {season.year} · {seasonStatusLabel(season.status)}
            {bracket && ` · ${bracket.leagueName}`}
          </span>
        )}
      </div>

      <div className={`playoff-banner${bannerMod}`}>{bannerText}</div>

      {!hasBracket ? (
        <div className="empty-block">
          当前联赛暂无季后赛对阵数据。常规赛结束后将自动生成对阵树。
        </div>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>对阵树</h2>
            <span className="hint">
              {bracket!.totalRounds} 轮淘汰 · 早期五局三胜 · 决赛七局四胜
            </span>
          </div>
          <div className="panel-body">
            <div className="playoff-bracket">
              {rounds.map((rd) => (
                <div
                  className="bracket-round"
                  key={rd.round}
                  data-round={rd.round}
                >
                  <div className="bracket-round-title">{rd.label}</div>
                  <div className="bracket-round-series">
                    {rd.series.map((s) => (
                      <BracketSeriesCard
                        key={s.id}
                        series={s}
                        myTeamId={myTeamId}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* 冠军 */}
              <div className="bracket-round bracket-round-champion">
                <div className="bracket-round-title">冠军</div>
                <div
                  className={`bracket-champion${
                    bracket!.championId ? " is-crowned" : ""
                  }`}
                >
                  <span className="bracket-trophy">🏆</span>
                  <span className="bracket-champion-name">
                    {bracket!.championName ?? "待定"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 系列赛比分明细 */}
      {hasBracket && (
        <section className="panel">
          <div className="panel-head">
            <h2>系列赛比分</h2>
            <span className="hint">各轮次系列赛进度</span>
          </div>
          <div className="panel-body">
            <div className="playoff-series-list">
              {bracket!.series
                .slice()
                .sort((a, b) => a.round - b.round || a.slot - b.slot)
                .map((s) => (
                  <SeriesScoreRow
                    key={s.id}
                    series={s}
                    myTeamId={myTeamId}
                  />
                ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ── 对阵卡 ──

interface BracketSeriesCardProps {
  series: PlayoffSeriesInfo;
  myTeamId: string | null;
}

function BracketSeriesCard({ series, myTeamId }: BracketSeriesCardProps) {
  const aWinner = series.winnerId === series.teamAId;
  const bWinner = series.winnerId === series.teamBId;
  const hasScore = series.winsA > 0 || series.winsB > 0 || series.status !== "pending";

  function TeamRow({
    name,
    seed,
    wins,
    isWinner,
    teamId,
  }: {
    name: string;
    seed: number | null;
    wins: number;
    isWinner: boolean;
    teamId: string | null;
  }) {
    const isMine = teamId != null && teamId === myTeamId;
    return (
      <div
        className={`bracket-team${isWinner ? " is-winner" : ""}${
          hasScore && !isWinner && series.status === "completed" ? " is-loser" : ""
        }`}
      >
        {seed != null && <span className="bt-seed">{seed}</span>}
        <span className={`bt-name${isMine ? " is-mine" : ""}`}>
          {name || "待定"}
        </span>
        {hasScore ? (
          <span className="bt-score">{wins}</span>
        ) : (
          <span className="bt-score is-empty">—</span>
        )}
      </div>
    );
  }

  return (
    <div className="bracket-match">
      <TeamRow
        name={series.teamAName}
        seed={series.seedA}
        wins={series.winsA}
        isWinner={aWinner}
        teamId={series.teamAId}
      />
      <TeamRow
        name={series.teamBName}
        seed={series.seedB}
        wins={series.winsB}
        isWinner={bWinner}
        teamId={series.teamBId}
      />
    </div>
  );
}

// ── 系列赛比分行 ──

function SeriesScoreRow({
  series,
  myTeamId,
}: {
  series: PlayoffSeriesInfo;
  myTeamId: string | null;
}) {
  const isMineA = series.teamAId === myTeamId;
  const isMineB = series.teamBId === myTeamId;
  const meta =
    series.status === "completed"
      ? `已决出 · 共 ${series.matches.filter((m) => m.status === "settled").length} 场`
      : series.status === "in_progress"
        ? "进行中"
        : `${series.matches.length} 场待赛`;

  return (
    <div className="playoff-series-item" key={series.id}>
      <div className={`ps-team${isMineA ? " is-mine" : ""}`}>
        {series.seedA != null && <span className="ps-seed">#{series.seedA}</span>}
        <span className="ps-name">{series.teamAName || "待定"}</span>
        <span className="ps-wins">{series.winsA}</span>
      </div>
      <span className="ps-colon">:</span>
      <div className={`ps-team${isMineB ? " is-mine" : ""}`}>
        <span className="ps-wins">{series.winsB}</span>
        <span className="ps-name">{series.teamBName || "待定"}</span>
        {series.seedB != null && <span className="ps-seed">#{series.seedB}</span>}
      </div>
      <span className="ps-meta">{meta}</span>
    </div>
  );
}
