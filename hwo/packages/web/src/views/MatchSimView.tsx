/**
 * MatchSimView — 比赛模拟体验（保留 M0 流程）
 *
 * 旧版 4 tab 流程：球队阵容 → 战术选择 → 比赛模拟 → 比赛直播。
 * 在 M1 重构后仍可作为沙盒自由模拟，但不再绑定用户赛季。
 */

import { useEffect, useState } from "react";
import type {
  TeamRoster,
  TeamDetail,
  TacticPreset,
  SimOutput,
  SimMatchRequest,
} from "../types";
import { fetchTeams, fetchTeam, fetchTactics, postSimMatch } from "../api";
import { Roster } from "../components/Roster";
import { Tactics } from "../components/Tactics";
import { Match } from "../components/Match";
import { LiveMatch } from "../components/LiveMatch";

type Tab = "roster" | "tactics" | "match" | "live";

const TABS: { id: Tab; label: string }[] = [
  { id: "roster", label: "球队阵容" },
  { id: "tactics", label: "战术选择" },
  { id: "match", label: "比赛模拟" },
  { id: "live", label: "比赛直播" },
];

export function MatchSimView() {
  const [tab, setTab] = useState<Tab>("roster");

  const [teams, setTeams] = useState<TeamRoster[] | null>(null);
  const [tactics, setTactics] = useState<TacticPreset[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [tacticsError, setTacticsError] = useState<string | null>(null);

  const [homeTeamId, setHomeTeamId] = useState<string | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<string | null>(null);
  const [homeTeam, setHomeTeam] = useState<TeamDetail | null>(null);
  const [awayTeam, setAwayTeam] = useState<TeamDetail | null>(null);

  const [homeTacticId, setHomeTacticId] = useState<string | null>(null);
  const [awayTacticId, setAwayTacticId] = useState<string | null>(null);

  const [simResult, setSimResult] = useState<SimOutput | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeams()
      .then((data) => {
        if (!cancelled) setTeams(data);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setTeamsError(e instanceof Error ? e.message : String(e));
      });
    fetchTactics()
      .then((data) => {
        if (!cancelled) setTactics(data);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setTacticsError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!homeTeamId) {
      setHomeTeam(null);
      return;
    }
    let cancelled = false;
    fetchTeam(homeTeamId)
      .then((t) => {
        if (!cancelled) setHomeTeam(t);
      })
      .catch(() => {
        if (!cancelled) setHomeTeam(null);
      });
    return () => {
      cancelled = true;
    };
  }, [homeTeamId]);

  useEffect(() => {
    if (!awayTeamId) {
      setAwayTeam(null);
      return;
    }
    let cancelled = false;
    fetchTeam(awayTeamId)
      .then((t) => {
        if (!cancelled) setAwayTeam(t);
      })
      .catch(() => {
        if (!cancelled) setAwayTeam(null);
      });
    return () => {
      cancelled = true;
    };
  }, [awayTeamId]);

  function pickTeam(role: "home" | "away", teamId: string): void {
    setSimResult(null);
    if (role === "home") {
      if (homeTeamId === teamId) {
        setHomeTeamId(null);
        return;
      }
      setHomeTeamId(teamId);
      if (awayTeamId === teamId) setAwayTeamId(null);
    } else {
      if (awayTeamId === teamId) {
        setAwayTeamId(null);
        return;
      }
      setAwayTeamId(teamId);
      if (homeTeamId === teamId) setHomeTeamId(null);
    }
  }

  function pickTactic(role: "home" | "away", tacticId: string): void {
    setSimResult(null);
    if (role === "home") {
      setHomeTacticId(homeTacticId === tacticId ? null : tacticId);
    } else {
      setAwayTacticId(awayTacticId === tacticId ? null : tacticId);
    }
  }

  async function runSim(): Promise<void> {
    if (!homeTeamId || !awayTeamId || !homeTacticId || !awayTacticId) return;
    setSimLoading(true);
    setSimError(null);
    try {
      const req: SimMatchRequest = {
        homeTeamId,
        awayTeamId,
        homeTacticId,
        awayTacticId,
      };
      const out = await postSimMatch(req);
      setSimResult(out);
    } catch (e: unknown) {
      setSimError(e instanceof Error ? e.message : String(e));
    } finally {
      setSimLoading(false);
    }
  }

  const rosterDone = Boolean(homeTeamId && awayTeamId);
  const tacticsDone = Boolean(homeTacticId && awayTacticId);
  const matchDone = Boolean(simResult);
  const liveDone = Boolean(simResult);

  const stepDone: Record<Tab, boolean> = {
    roster: rosterDone,
    tactics: tacticsDone,
    match: matchDone,
    live: liveDone,
  };

  return (
    <div className="match-sim-view">
      <div className="match-sim-tabs">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className={`tab-step${stepDone[t.id] ? " done" : ""}`}>
              {stepDone[t.id] ? "✓" : i + 1}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "roster" && (
        <Roster
          teams={teams}
          error={teamsError}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onPickTeam={pickTeam}
        />
      )}
      {tab === "tactics" && (
        <Tactics
          tactics={tactics}
          error={tacticsError}
          homeTacticId={homeTacticId}
          awayTacticId={awayTacticId}
          onPickTactic={pickTactic}
        />
      )}
      {tab === "match" && (
        <Match
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          homeTacticId={homeTacticId}
          awayTacticId={awayTacticId}
          tactics={tactics}
          onSimulate={runSim}
          simResult={simResult}
          simLoading={simLoading}
          simError={simError}
        />
      )}
      {tab === "live" && (
        <LiveMatch
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
          homeTacticId={homeTacticId}
          awayTacticId={awayTacticId}
          tactics={tactics}
          onSimulate={runSim}
          simResult={simResult}
          simLoading={simLoading}
          simError={simError}
        />
      )}
    </div>
  );
}
