/**
 * 球队对比表（Team Stats）——每行一个统计项，主队 vs 客队两列对照。
 * 投篮 / 三分 / 罚球 列显示 "made-att (pct%)"。
 */

import type { TeamStat } from "../types";

interface TeamStatsTableProps {
  homeName: string;
  awayName: string;
  home: TeamStat;
  away: TeamStat;
}

function pct(made: number, att: number): string {
  if (att === 0) return "-";
  return `${((made / att) * 100).toFixed(1)}`;
}

function shotLine(made: number, att: number): string {
  return `${made}-${att}`;
}

function shotCell(made: number, att: number): string {
  return `${shotLine(made, att)} (${pct(made, att)}%)`;
}

interface StatRow {
  label: string;
  home: string;
  away: string;
}

export function TeamStatsTable({
  homeName,
  awayName,
  home,
  away,
}: TeamStatsTableProps) {
  const rows: StatRow[] = [
    { label: "得分", home: String(home.score), away: String(away.score) },
    { label: "投篮 FG", home: shotCell(home.fgm, home.fga), away: shotCell(away.fgm, away.fga) },
    { label: "三分 3P", home: shotCell(home.tpm, home.tpa), away: shotCell(away.tpm, away.tpa) },
    { label: "罚球 FT", home: shotCell(home.ftm, home.fta), away: shotCell(away.ftm, away.fta) },
    { label: "进攻篮板", home: String(home.offReb), away: String(away.offReb) },
    { label: "防守篮板", home: String(home.defReb), away: String(away.defReb) },
    { label: "总篮板", home: String(home.rebounds), away: String(away.rebounds) },
    { label: "助攻", home: String(home.assists), away: String(away.assists) },
    { label: "抢断", home: String(home.steals), away: String(away.steals) },
    { label: "盖帽", home: String(home.blocks), away: String(away.blocks) },
    { label: "失误", home: String(home.turnovers), away: String(away.turnovers) },
    { label: "犯规", home: String(home.fouls), away: String(away.fouls) },
  ];

  return (
    <div className="team-stats-table">
      <table>
        <thead>
          <tr>
            <th className="tst-label">统计项</th>
            <th className="tst-home">{homeName}</th>
            <th className="tst-away">{awayName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="tst-label">{row.label}</td>
              <td className="tst-home">{row.home}</td>
              <td className="tst-away">{row.away}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
