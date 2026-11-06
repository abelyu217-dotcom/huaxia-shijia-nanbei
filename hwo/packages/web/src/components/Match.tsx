/**
 * 页面 3：比赛模拟（Match）
 * - 显示主客队与各自战术
 * - 开始比赛 → POST /api/sim/match
 * - 结果：比分牌 + 逐节比分 + Tab（Box Score / Play-by-Play / Team Stats）
 *
 * 参考 RimAttack 比赛页结构升级。Props 接口与 App.tsx 调用方式保持不变。
 */

import { useState } from "react";
import type {
  TeamDetail,
  TacticPreset,
  SimOutput,
} from "../types";
import { PbpFeed } from "./PbpFeed";
import { BoxScoreTable } from "./BoxScoreTable";
import { QuarterScoreTable } from "./QuarterScoreTable";
import { TeamStatsTable } from "./TeamStatsTable";

type MatchTab = "box" | "pbp" | "team";

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
  const [tab, setTab] = useState<MatchTab>("box");

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

        {!simResult && !simLoading && !simError && (
          <div className="empty-state">
            <div className="empty-state-icon">🏀</div>
            <div className="empty-state-title">还没有比赛数据</div>
            <div className="empty-state-desc">
              选择主客队与战术后，点击「开始比赛」即可生成完整的模拟战报、技术统计与逐回合记录。
            </div>
          </div>
        )}

        {simLoading && (
          <div className="state">
            <span className="spinner" />
            正在模拟比赛…
            <div className="skeleton-table skeleton" style={{ marginTop: 16 }} />
            <div className="skeleton-line skeleton" />
            <div className="skeleton-line skeleton" style={{ width: "70%" }} />
          </div>
        )}

        {simResult && !simLoading && r && (
          <>
            {/* 1. 顶部信息栏 + 比分牌 */}
            <div className="match-topbar">
              <span className="match-back">← 返回</span>
              <div className="match-scoreline">
                <div
                  className={`msl-side-block home${homeWon ? " is-winner" : ""}`}
                >
                  <span className="msl-tag">主</span>
                  <span className="msl-team">{homeName}</span>
                  {homeWon && <span className="msl-win">胜</span>}
                </div>
                <div className="msl-bigscore">
                  <span className="msl-score home">{r.homeScore}</span>
                  <span className="msl-colon">:</span>
                  <span className="msl-score away">{r.awayScore}</span>
                  {r.isClutch && <span className="clutch-badge">绝杀</span>}
                </div>
                <div
                  className={`msl-side-block away${awayWon ? " is-winner" : ""}`}
                >
                  <span className="msl-tag">客</span>
                  <span className="msl-team">{awayName}</span>
                  {awayWon && <span className="msl-win">胜</span>}
                </div>
              </div>
              <span className="match-meta">
                第 {simResult.quarterScores.home.length} 节 · 10:00 开赛 · seed{" "}
                {simResult.seed}
              </span>
            </div>

            {/* 2. 逐节比分表 */}
            <QuarterScoreTable
              homeName={homeName}
              awayName={awayName}
              homeScores={simResult.quarterScores.home}
              awayScores={simResult.quarterScores.away}
              homeTotal={r.homeScore}
              awayTotal={r.awayScore}
            />

            {/* 3. Tab 切换 */}
            <div className="match-tabs tab-nav">
              <button
                type="button"
                className={`tab${tab === "box" ? " is-active" : ""}`}
                onClick={() => setTab("box")}
              >
                Box Score
              </button>
              <button
                type="button"
                className={`tab${tab === "pbp" ? " is-active" : ""}`}
                onClick={() => setTab("pbp")}
              >
                Play-by-Play
              </button>
              <button
                type="button"
                className={`tab${tab === "team" ? " is-active" : ""}`}
                onClick={() => setTab("team")}
              >
                Team Stats
              </button>
            </div>

            <div className="tab-content">
              {tab === "box" && (
                <BoxScoreTable
                  homeName={homeName}
                  awayName={awayName}
                  homeStat={simResult.boxScore.home}
                  awayStat={simResult.boxScore.away}
                  homePlayers={homeTeam?.players ?? null}
                  awayPlayers={awayTeam?.players ?? null}
                />
              )}
              {tab === "pbp" && (
                <PbpFeed
                  events={simResult.pbp}
                  homeTeamId={homeTeamId ?? ""}
                  awayTeamId={awayTeamId ?? ""}
                />
              )}
              {tab === "team" && (
                <TeamStatsTable
                  homeName={homeName}
                  awayName={awayName}
                  home={simResult.boxScore.home}
                  away={simResult.boxScore.away}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
