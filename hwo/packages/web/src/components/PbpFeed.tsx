/**
 * PBP 文字直播——按节次分组、节次分隔头、滚动、主客队配色。
 */

import type { PbpEvent } from "../types";

interface PbpFeedProps {
  events: PbpEvent[];
  homeTeamId: string;
  awayTeamId: string;
}

function quarterLabel(q: number): string {
  return q <= 4 ? `第 ${q} 节` : `加时 ${q - 4}`;
}

export function PbpFeed({ events, homeTeamId, awayTeamId }: PbpFeedProps) {
  if (events.length === 0) {
    return <div className="empty-block">无比赛事件</div>;
  }

  // 按节次分组（保持原顺序）。
  const groups: { quarter: number; items: PbpEvent[] }[] = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.quarter === ev.quarter) {
      last.items.push(ev);
    } else {
      groups.push({ quarter: ev.quarter, items: [ev] });
    }
  }

  return (
    <div className="pbp-feed">
      {groups.map((g) => (
        <section key={g.quarter}>
          <div className="pbp-quarter">{quarterLabel(g.quarter)}</div>
          {g.items.map((ev, i) => {
            const sideClass =
              ev.teamId === homeTeamId
                ? "home"
                : ev.teamId === awayTeamId
                  ? "away"
                  : "";
            return (
              <div className={`pbp-item ${sideClass}`} key={`${g.quarter}-${i}`}>
                <span className="pbp-clock">{ev.clock}</span>
                <span className="pbp-desc">{ev.desc}</span>
                <span className="pbp-score">
                  {ev.scoreHome}:{ev.scoreAway}
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
