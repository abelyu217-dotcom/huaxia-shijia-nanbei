/**
 * Box Score 技术统计表——单张表包含双方球员。
 * 按主/客队分段（小标题行），每队末尾合计行；DNP 球员（minutes=0）
 * 整行显示 DNP，其余列 "-"；+/- 用颜色区分正负。
 *
 * 列：球员 | MIN | PTS | FG | FG% | 3P | 3P% | FT | FT% | OREB | DREB | REB
 *      | AST | TOV | STL | BLK | PF | +/-
 */

import type { PlayerStat, TeamStat, PlayerDetail } from "../types";
import { POSITION_LABEL } from "../lib";

interface BoxScoreTableProps {
  homeName: string;
  awayName: string;
  homeStat: TeamStat;
  awayStat: TeamStat;
  homePlayers: PlayerDetail[] | null;
  awayPlayers: PlayerDetail[] | null;
}

const STAT_COLUMN_COUNT = 17;
const DNP_DASH_COUNT = STAT_COLUMN_COUNT - 1; // MIN 列显示 DNP，其余 16 列显示 "-"
const TOTAL_COLSPAN = STAT_COLUMN_COUNT + 1; // 含球员列

function pct(made: number, att: number): string {
  if (att === 0) return "-";
  return `${((made / att) * 100).toFixed(1)}`;
}

function shotLine(made: number, att: number): string {
  return `${made}-${att}`;
}

function plusMinusClass(v: number): string {
  if (v > 0) return "pm-pos";
  if (v < 0) return "pm-neg";
  return "pm-zero";
}

function plusMinusText(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

interface TeamSection {
  side: "home" | "away";
  name: string;
  stat: TeamStat;
}

function TeamSectionRows({
  section,
  nameMap,
}: {
  section: TeamSection;
  nameMap: Map<string, PlayerDetail>;
}) {
  const { side, name, stat } = section;
  return (
    <>
      <tr className={`bs-section ${side}`}>
        <td colSpan={TOTAL_COLSPAN}>
          <span className={`bs-side ${side}`}>
            {side === "home" ? "主队" : "客队"}
          </span>
          {name}
        </td>
      </tr>
      {stat.players.map((ps: PlayerStat) => {
        const detail = nameMap.get(ps.playerId);
        const pname = detail ? detail.name : ps.playerId;
        const pos = detail ? POSITION_LABEL[detail.position] : "";
        const dnp = ps.minutes === 0;
        return (
          <tr key={ps.playerId} className={dnp ? "bs-dnp-row" : undefined}>
            <td className="player">
              {pos && <span className="bs-pos">{pos}</span>}
              {pname}
            </td>
            {dnp ? (
              <>
                <td className="bs-dnp">DNP</td>
                {Array.from({ length: DNP_DASH_COUNT }, (_, i) => (
                  <td key={i}>-</td>
                ))}
              </>
            ) : (
              <>
                <td>{ps.minutes.toFixed(0)}</td>
                <td>{ps.points}</td>
                <td>{shotLine(ps.fgm, ps.fga)}</td>
                <td>{pct(ps.fgm, ps.fga)}</td>
                <td>{shotLine(ps.tpm, ps.tpa)}</td>
                <td>{pct(ps.tpm, ps.tpa)}</td>
                <td>{shotLine(ps.ftm, ps.fta)}</td>
                <td>{pct(ps.ftm, ps.fta)}</td>
                <td>{ps.offReb}</td>
                <td>{ps.defReb}</td>
                <td>{ps.rebounds}</td>
                <td>{ps.assists}</td>
                <td>{ps.turnovers}</td>
                <td>{ps.steals}</td>
                <td>{ps.blocks}</td>
                <td>{ps.fouls}</td>
                <td className={plusMinusClass(ps.plusMinus)}>
                  {plusMinusText(ps.plusMinus)}
                </td>
              </>
            )}
          </tr>
        );
      })}
      <tr className={`bs-totals ${side}`}>
        <td>合计</td>
        <td>—</td>
        <td>{stat.score}</td>
        <td>{shotLine(stat.fgm, stat.fga)}</td>
        <td>{pct(stat.fgm, stat.fga)}</td>
        <td>{shotLine(stat.tpm, stat.tpa)}</td>
        <td>{pct(stat.tpm, stat.tpa)}</td>
        <td>{shotLine(stat.ftm, stat.fta)}</td>
        <td>{pct(stat.ftm, stat.fta)}</td>
        <td>{stat.offReb}</td>
        <td>{stat.defReb}</td>
        <td>{stat.rebounds}</td>
        <td>{stat.assists}</td>
        <td>{stat.turnovers}</td>
        <td>{stat.steals}</td>
        <td>{stat.blocks}</td>
        <td>{stat.fouls}</td>
        <td>—</td>
      </tr>
    </>
  );
}

export function BoxScoreTable({
  homeName,
  awayName,
  homeStat,
  awayStat,
  homePlayers,
  awayPlayers,
}: BoxScoreTableProps) {
  const homeMap = new Map<string, PlayerDetail>();
  if (homePlayers) {
    for (const p of homePlayers) homeMap.set(p.id, p);
  }
  const awayMap = new Map<string, PlayerDetail>();
  if (awayPlayers) {
    for (const p of awayPlayers) awayMap.set(p.id, p);
  }

  const sections: TeamSection[] = [
    { side: "home", name: homeName, stat: homeStat },
    { side: "away", name: awayName, stat: awayStat },
  ];

  return (
    <div className="boxscore bs-combined">
      <div className="bs-scroll">
        <table className="bs-table">
          <thead>
            <tr>
              <th>球员</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>FG</th>
              <th>FG%</th>
              <th>3P</th>
              <th>3P%</th>
              <th>FT</th>
              <th>FT%</th>
              <th>OREB</th>
              <th>DREB</th>
              <th>REB</th>
              <th>AST</th>
              <th>TOV</th>
              <th>STL</th>
              <th>BLK</th>
              <th>PF</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const nameMap = s.side === "home" ? homeMap : awayMap;
              return (
                <TeamSectionRows key={s.side} section={s} nameMap={nameMap} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
