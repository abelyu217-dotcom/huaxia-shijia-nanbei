/**
 * Box Score 技术统计表——一支球队的球员逐行统计 + 全队合计。
 */

import type { PlayerStat, TeamStat, PlayerDetail } from "../types";
import { POSITION_LABEL } from "../lib";

interface BoxScoreTableProps {
  title: string;
  side: "home" | "away";
  stat: TeamStat;
  players: PlayerDetail[] | null;
}

function shotLine(made: number, att: number): string {
  return `${made}-${att}`;
}

export function BoxScoreTable({
  title,
  side,
  stat,
  players,
}: BoxScoreTableProps) {
  const nameMap = new Map<string, PlayerDetail>();
  if (players) {
    for (const p of players) nameMap.set(p.id, p);
  }

  const rows = stat.players;

  return (
    <div className="boxscore">
      <div className="boxscore-title">
        <span>{title}</span>
        <span className={`bs-side ${side}`}>
          {side === "home" ? "主队" : "客队"}
        </span>
      </div>
      <div className="bs-scroll">
        <table className="bs-table">
          <thead>
            <tr>
              <th>球员</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>FG</th>
              <th>3P</th>
              <th>FT</th>
              <th>REB</th>
              <th>AST</th>
              <th>STL</th>
              <th>BLK</th>
              <th>TOV</th>
              <th>PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ps: PlayerStat) => {
              const detail = nameMap.get(ps.playerId);
              const name = detail ? detail.name : ps.playerId;
              const pos = detail ? POSITION_LABEL[detail.position] : "";
              return (
                <tr key={ps.playerId}>
                  <td className="player">
                    {pos && <span className="bs-pos">{pos}</span>}
                    {name}
                  </td>
                  <td>{ps.minutes.toFixed(0)}</td>
                  <td>{ps.points}</td>
                  <td>{shotLine(ps.fgm, ps.fga)}</td>
                  <td>{shotLine(ps.tpm, ps.tpa)}</td>
                  <td>{shotLine(ps.ftm, ps.fta)}</td>
                  <td>{ps.rebounds}</td>
                  <td>{ps.assists}</td>
                  <td>{ps.steals}</td>
                  <td>{ps.blocks}</td>
                  <td>{ps.turnovers}</td>
                  <td>{ps.fouls}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bs-totals">
              <td>合计</td>
              <td>—</td>
              <td>{stat.score}</td>
              <td>{shotLine(stat.fgm, stat.fga)}</td>
              <td>{shotLine(stat.tpm, stat.tpa)}</td>
              <td>{shotLine(stat.ftm, stat.fta)}</td>
              <td>{stat.rebounds}</td>
              <td>{stat.assists}</td>
              <td>{stat.steals}</td>
              <td>{stat.blocks}</td>
              <td>{stat.turnovers}</td>
              <td>{stat.fouls}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
