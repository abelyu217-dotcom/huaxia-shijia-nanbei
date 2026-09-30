/**
 * 页面 1：球队阵容（Roster）
 * - 展示全部 6 支球队，点击分配为主队 / 客队
 * - 选中球队后展示球员卡片（位置、名字、OVR 等级配色、关键能力值）
 */

import { useState } from "react";
import type { TeamRoster, TeamDetail } from "../types";
import { avgOvr, ovrVal } from "../lib";
import { PlayerCard } from "./PlayerCard";

interface RosterProps {
  teams: TeamRoster[] | null;
  error: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeam: TeamDetail | null;
  awayTeam: TeamDetail | null;
  onPickTeam: (role: "home" | "away", teamId: string) => void;
}

export function Roster({
  teams,
  error,
  homeTeamId,
  awayTeamId,
  homeTeam,
  awayTeam,
  onPickTeam,
}: RosterProps) {
  const [mode, setMode] = useState<"home" | "away">("home");

  const nameOf = (id: string | null): string => {
    if (!id || !teams) return "未选择";
    return teams.find((t) => t.id === id)?.name ?? id;
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>球队阵容</h2>
        <span className="hint">选择主队与客队，查看球员能力</span>
      </div>
      <div className="panel-body">
        <div className="control-bar">
          <div className="slots">
            <div className={`slot home${homeTeamId ? "" : " empty"}`}>
              <span className="slot-label">主队</span>
              <span className="slot-value">{nameOf(homeTeamId)}</span>
            </div>
            <div className={`slot away${awayTeamId ? "" : " empty"}`}>
              <span className="slot-label">客队</span>
              <span className="slot-value">{nameOf(awayTeamId)}</span>
            </div>
          </div>
          <div className="mode-toggle">
            <button
              type="button"
              className={`mode-btn home${mode === "home" ? " is-active" : ""}`}
              onClick={() => setMode("home")}
            >
              选主队
            </button>
            <button
              type="button"
              className={`mode-btn away${mode === "away" ? " is-active" : ""}`}
              onClick={() => setMode("away")}
            >
              选客队
            </button>
          </div>
        </div>

        <section className="section">
          <h3 className="section-title">球队</h3>
          {error ? (
            <div className="state error">球队加载失败：{error}</div>
          ) : !teams ? (
            <div className="state">
              <span className="spinner" />
              正在加载球队…
            </div>
          ) : (
            <div className="team-grid">
              {teams.map((t) => {
                const isHome = homeTeamId === t.id;
                const isAway = awayTeamId === t.id;
                const cls = [
                  "team-card",
                  isHome ? "is-home" : "",
                  isAway ? "is-away" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    type="button"
                    key={t.id}
                    className={cls}
                    onClick={() => onPickTeam(mode, t.id)}
                  >
                    <div className="team-card-badges">
                      {isHome && <span className="team-badge home">主</span>}
                      {isAway && <span className="team-badge away">客</span>}
                    </div>
                    <span className="team-card-name">{t.name}</span>
                    <span className="team-card-meta">
                      <span>{t.players.length} 人</span>
                      <span className="team-card-ovr">
                        OVR {avgOvr(t.players.map((p) => ovrVal(p.ovr)))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="section">
          <h3 className="section-title">球员阵容</h3>
          {!homeTeam && !awayTeam ? (
            <div className="empty-block">选择球队后查看球员能力</div>
          ) : (
            <div
              className={`roster-panels${
                homeTeam && awayTeam ? "" : " single"
              }`}
            >
              {homeTeam && (
                <RosterPanel
                  side="home"
                  name={nameOf(homeTeamId)}
                  team={homeTeam}
                />
              )}
              {awayTeam && (
                <RosterPanel
                  side="away"
                  name={nameOf(awayTeamId)}
                  team={awayTeam}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

interface RosterPanelProps {
  side: "home" | "away";
  name: string;
  team: TeamDetail;
}

function RosterPanel({ side, name, team }: RosterPanelProps) {
  return (
    <div className="roster-panel">
      <div className="roster-panel-head">
        <span className="rp-team">{name}</span>
        <span className={`rp-side ${side}`}>
          {side === "home" ? "主队" : "客队"}
        </span>
      </div>
      <div className="roster-panel-body">
        <div className="player-grid">
          {team.players.map((p) => (
            <PlayerCard key={p.id} player={p} />
          ))}
        </div>
      </div>
    </div>
  );
}
