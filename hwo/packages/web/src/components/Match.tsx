/**
 * 页面 3：比赛模拟（Match）
 * - 显示主客队与各自战术
 * - 开始比赛 → POST /api/sim/match
 * - 结果：大比分牌 + PBP 文字直播 + 双方 Box Score
 */

import type {
  TeamDetail,
  TacticPreset,
  SimOutput,
} from "../types";
import { PbpFeed } from "./PbpFeed";
import { BoxScoreTable } from "./BoxScoreTable";

interface MatchProps {
  homeTeam: TeamDetail | null;
  awayTeam: TeamDetail | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTacticId: string | null;
  awayTacticId: string | null;
  tactics: TacticPreset[] | null;
  onSimulate: () => void;
  simResult: SimOutput | null;
  simLoading: boolean;
  simError: string | null;
}

function teamLabel(detail: TeamDetail | null, id: string | null): string {
  if (detail) return detail.name;
  if (id) return "加载中…";
  return "未选择";
}

export function Match({
  homeTeam,
  awayTeam,
  homeTeamId,
  awayTeamId,
  homeTacticId,
  awayTacticId,
  tactics,
  onSimulate,
  simResult,
  simLoading,
  simError,
}: MatchProps) {
  const ready = Boolean(
    homeTeamId && awayTeamId && homeTacticId && awayTacticId,
  );

  const tacticName = (id: string | null): string => {
    if (!id || !tactics) return "未选择";
    return tactics.find((t) => t.id === id)?.name ?? id;
  };

  const homeName = teamLabel(homeTeam, homeTeamId);
  const awayName = teamLabel(awayTeam, awayTeamId);

  const r = simResult?.result;
  const homeWon = r ? r.winnerId === homeTeamId : false;
  const awayWon = r ? r.winnerId === awayTeamId : false;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>比赛模拟</h2>
        <span className="hint">确认对阵与战术后开始模拟</span>
      </div>
      <div className="panel-body">
        <div className="match-summary">
          <div className="match-side home">
            <span className="ms-label">主队</span>
            <span className="ms-team">{homeName}</span>
            <span className="ms-tactic">
              战术：<strong>{tacticName(homeTacticId)}</strong>
            </span>
          </div>
          <span className="match-vs">VS</span>
          <div className="match-side away">
            <span className="ms-label">客队</span>
            <span className="ms-team">{awayName}</span>
            <span className="ms-tactic">
              战术：<strong>{tacticName(awayTacticId)}</strong>
            </span>
          </div>
        </div>

        <div className="sim-controls">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSimulate}
            disabled={!ready || simLoading}
          >
            {simLoading ? "模拟中…" : "开始比赛"}
          </button>
          {!ready ? (
            <span className="sim-hint">
              请先在「球队阵容」与「战术选择」完成主客队与战术选择
            </span>
          ) : (
            <span className="sim-hint">点击开始模拟一场比赛</span>
          )}
        </div>

        {simError && <div className="match-error">模拟失败：{simError}</div>}

        {simLoading && (
          <div className="state">
            <span className="spinner" />
            正在模拟比赛…
          </div>
        )}

        {simResult && !simLoading && r && (
          <>
            <div className="scoreboard">
              <div className="score-side home">
                <span className="score-team">{homeName}</span>
                <span className="score-num">{r.homeScore}</span>
                {homeWon ? (
                  <span className="score-winner">胜</span>
                ) : awayWon ? (
                  <span className="score-loser">负</span>
                ) : null}
              </div>
              <div className="score-divider">
                <span>VS</span>
                {r.isClutch && <span className="clutch-badge">绝杀</span>}
                <span className="seed-tag">seed {simResult.seed}</span>
              </div>
              <div className="score-side away">
                <span className="score-team">{awayName}</span>
                <span className="score-num">{r.awayScore}</span>
                {awayWon ? (
                  <span className="score-winner">胜</span>
                ) : homeWon ? (
                  <span className="score-loser">负</span>
                ) : null}
              </div>
            </div>

            <div className="match-cols">
              <section className="section">
                <h3 className="section-title">文字直播</h3>
                <PbpFeed
                  events={simResult.pbp}
                  homeTeamId={homeTeamId ?? ""}
                  awayTeamId={awayTeamId ?? ""}
                />
              </section>
              <section className="section">
                <h3 className="section-title">技术统计</h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <BoxScoreTable
                    title={homeName}
                    side="home"
                    stat={simResult.boxScore.home}
                    players={homeTeam?.players ?? null}
                  />
                  <BoxScoreTable
                    title={awayName}
                    side="away"
                    stat={simResult.boxScore.away}
                    players={awayTeam?.players ?? null}
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
