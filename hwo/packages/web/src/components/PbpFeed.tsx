/**
 * PBP 文字直播——按节次分组、双栏布局（主队左/客队右）、生动文案。
 */

import type { PbpEvent } from "../types";
import { eventIcon, vividDesc } from "../lib";

interface PbpFeedProps {
  events: PbpEvent[];
  homeTeamId: string;
  awayTeamId: string;
}

function quarterLabel(q: number): string {
  return q <= 4 ? `第 ${q} 节` : `加时 ${q - 4}`;
}

/** 从引擎 desc 中提取球员/球队名（desc 格式："名字 描述..."） */
function extractName(ev: PbpEvent): string | undefined {
  if (!ev.actorId && ev.type !== "turnover") return undefined;
  const parts = ev.desc.split(" ");
  return parts.length > 0 ? parts[0] : undefined;
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
        <section key={g.quarter} className="pbp-group">
          <div className="pbp-quarter">{quarterLabel(g.quarter)}</div>
          <div className="pbp-dual-list">
            {g.items.map((ev, i) => {
              const isHome = ev.teamId === homeTeamId;
              const isAway = ev.teamId === awayTeamId;
              const isNeutral = !isHome && !isAway;
              const playerName = extractName(ev);
              const desc = vividDesc(ev, playerName);

              if (isNeutral) {
                return (
                  <div
                    key={`${g.quarter}-${i}`}
                    className="pbp-row pbp-neutral"
                  >
                    <span className="pbp-clock">
                      {eventIcon(ev.type)} {ev.clock}
                    </span>
                    <span className="pbp-desc">{desc}</span>
                    <span className="pbp-score">
                      {ev.scoreHome}:{ev.scoreAway}
                    </span>
                  </div>
                );
              }

              return (
                <div key={`${g.quarter}-${i}`} className="pbp-row">
                  {isHome && (
                    <div className="pbp-side pbp-home">
                      <span className="pbp-side-icon">{eventIcon(ev.type)}</span>
                      <span className="pbp-side-desc">{desc}</span>
                    </div>
                  )}
                  {!isHome && <div className="pbp-side" />}

                  <div className="pbp-mid">
                    <span className="pbp-mid-clock">{ev.clock}</span>
                    <span className="pbp-mid-score">
                      {ev.scoreHome}:{ev.scoreAway}
                    </span>
                  </div>

                  {isAway && (
                    <div className="pbp-side pbp-away">
                      <span className="pbp-side-desc">{desc}</span>
                      <span className="pbp-side-icon">{eventIcon(ev.type)}</span>
                    </div>
                  )}
                  {!isAway && <div className="pbp-side" />}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
