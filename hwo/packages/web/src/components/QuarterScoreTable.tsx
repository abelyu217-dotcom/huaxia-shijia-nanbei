/**
 * 逐节比分表——主客队各一行，按节次（Q1-Q4 / 加时）展示得分与总分。
 * 紧贴比分牌下方，紧凑可读。
 */

interface QuarterScoreTableProps {
  homeName: string;
  awayName: string;
  homeScores: number[];
  awayScores: number[];
  homeTotal: number;
  awayTotal: number;
}

function quarterHeader(i: number): string {
  return i < 4 ? `Q${i + 1}` : `OT${i - 3}`;
}

export function QuarterScoreTable({
  homeName,
  awayName,
  homeScores,
  awayScores,
  homeTotal,
  awayTotal,
}: QuarterScoreTableProps) {
  const quarters = Math.max(homeScores.length, awayScores.length);

  return (
    <div className="quarter-table">
      <table>
        <thead>
          <tr>
            <th className="qt-team">球队</th>
            {Array.from({ length: quarters }, (_, i) => (
              <th key={i}>{quarterHeader(i)}</th>
            ))}
            <th className="qt-total">总</th>
          </tr>
        </thead>
        <tbody>
          <tr className="qt-row home">
            <td className="qt-team">{homeName}</td>
            {Array.from({ length: quarters }, (_, i) => (
              <td key={i}>{homeScores[i] ?? 0}</td>
            ))}
            <td className="qt-total">{homeTotal}</td>
          </tr>
          <tr className="qt-row away">
            <td className="qt-team">{awayName}</td>
            {Array.from({ length: quarters }, (_, i) => (
              <td key={i}>{awayScores[i] ?? 0}</td>
            ))}
            <td className="qt-total">{awayTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
