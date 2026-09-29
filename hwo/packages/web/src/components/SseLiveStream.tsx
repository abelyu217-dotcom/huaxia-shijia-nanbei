/**
 * SseLiveStream —— 基于 SSE 的实时比赛直播组件
 *
 * 订阅 /api/matches/:id/stream，按事件流渲染实时 PBP。
 * 与 LiveMatch（本地回放引擎）互补：本组件用于真实进行中或已结束比赛的实时流式观看。
 */

import { useEffect, useRef, useState } from "react";
import type { PbpEvent, SseStreamEvent, TeamStat } from "../types";
import { subscribeMatchStream } from "../api";
import { eventIcon, vividDesc } from "../lib";

interface Props {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
}

export function SseLiveStream({
  matchId,
  homeTeamName,
  awayTeamName,
  homeTeamId,
  awayTeamId,
}: Props) {
  const [events, setEvents] = useState<PbpEvent[]>([]);
  const [, setBoxScore] = useState<{
    home: TeamStat;
    away: TeamStat;
  } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setEvents([]);
    setBoxScore(null);
    setDone(false);
    setError(null);

    const es = subscribeMatchStream(
      matchId,
      (data) => {
        const msg = data as SseStreamEvent;
        if (msg.type === "pbp" && msg.event) {
          setEvents((prev) => [...prev, msg.event!]);
        } else if (msg.type === "box" && msg.boxScore) {
          setBoxScore(msg.boxScore);
        } else if (msg.type === "final") {
          setDone(true);
          if (msg.boxScore) setBoxScore(msg.boxScore);
          es.close();
        }
      },
      () => {
        setError("直播连接中断");
      },
    );
    esRef.current = es;

    return () => {
      es.close();
    };
  }, [matchId]);

  // 自动滚动到最新
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  const latest = events[events.length - 1];
  const homeScore = latest?.scoreHome ?? 0;
  const awayScore = latest?.scoreAway ?? 0;
  const quarter = latest?.quarter ?? 1;
  const clock = latest?.clock ?? "12:00";

  const playerNames = new Map<string, string>();

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>实时直播</h2>
        <span className="hint">
          {homeTeamName} vs {awayTeamName}
        </span>
        {!done && (
          <span className="live-live-dot">
            <span className="pulse" /> LIVE
          </span>
        )}
      </div>
      <div className="panel-body">
        {error && <div className="state error">{error}</div>}

        {/* 实时比分牌 */}
        <div className="live-scoreboard">
          <div className="ls-team home">
            <span className="ls-tag">主</span>
            <span className="ls-name">{homeTeamName}</span>
            <span className="ls-score">{homeScore}</span>
          </div>
          <div className="ls-center">
            <div className="ls-quarter">
              {done ? "全场结束" : `第 ${quarter} 节`}
            </div>
            <div className="ls-clock">{clock}</div>
          </div>
          <div className="ls-team away">
            <span className="ls-score">{awayScore}</span>
            <span className="ls-name">{awayTeamName}</span>
            <span className="ls-tag">客</span>
          </div>
        </div>

        {/* PBP 流 */}
        <div className="live-pbp-wrap">
          <div className="live-pbp-header">
            <span className="live-pbp-title">文字直播</span>
            <span className="live-progress-text">{events.length} 条事件</span>
          </div>
          <div className="pbp-dual" ref={feedRef}>
            {events.length === 0 && !done && (
              <div className="state">
                <span className="spinner" /> 等待比赛事件…
              </div>
            )}
            {events.map((ev, i) => {
              const isNewest = i === events.length - 1;
              const isHome = ev.teamId === homeTeamId;
              const isAway = ev.teamId === awayTeamId;
              const isNeutral = !isHome && !isAway;
              const playerName = ev.actorId
                ? playerNames.get(ev.actorId)
                : undefined;
              const desc = vividDesc(ev, playerName);

              if (isNeutral) {
                return (
                  <div
                    key={i}
                    className={`pbp-row pbp-neutral${
                      isNewest ? " is-newest" : ""
                    }`}
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
                <div
                  key={i}
                  className={`pbp-row${isNewest ? " is-newest" : ""}`}
                >
                  {isHome && (
                    <div className="pbp-side pbp-home">
                      <span className="pbp-side-icon">
                        {eventIcon(ev.type)}
                      </span>
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
                      <span className="pbp-side-icon">
                        {eventIcon(ev.type)}
                      </span>
                    </div>
                  )}
                  {!isAway && <div className="pbp-side" />}
                </div>
              );
            })}
            {done && (
              <div className="pbp-row pbp-neutral live-final">
                🏁 比赛结束 · {homeTeamName} {homeScore} : {awayScore}{" "}
                {awayTeamName}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
