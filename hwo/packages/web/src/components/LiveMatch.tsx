/**
 * 比赛直播页面——比赛进行中的实时观看界面。
 *
 * 与「比赛模拟」（赛后复盘）互补：
 *   - 比赛模拟：瞬间模拟完，展示完整 Box Score / PBP / Team Stats
 *   - 比赛直播：拿到全量 PBP 后，按节拍逐条回放，模拟"正在比赛"的观感
 *
 * 回放引擎：
 *   - idle → loading → playing → paused → finished
 *   - setInterval 推进 playbackIndex，每个 event 间隔由 speed 决定
 *   - 比分牌/时钟/球权从当前 event 派生，新事件带高亮动画
 */

import { useEffect, useRef, useState } from "react";
import type {
  TeamDetail,
  TacticPreset,
  SimOutput,
  PbpEvent,
} from "../types";

type PlayState = "idle" | "loading" | "playing" | "paused" | "finished";

interface LiveMatchProps {
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

const SPEEDS = [1, 2, 4] as const;
const BASE_INTERVAL = 650; // 1x 时每事件间隔 ms

function teamLabel(detail: TeamDetail | null, id: string | null): string {
  if (detail) return detail.name;
  if (id) return "加载中…";
  return "未选择";
}

/** 从事件数组中取最后一个（当前比分/时钟来源） */
function currentEvent(events: PbpEvent[]): PbpEvent | null {
  return events.length > 0 ? events[events.length - 1]! : null;
}

/** 事件类型对应的图标/语义色 */
function eventIcon(type: string): string {
  switch (type) {
    case "shot_made":
    case "three_made":
      return "🏀";
    case "shot_miss":
    case "three_miss":
      return "🏀";
    case "free_throw":
      return "🎯";
    case "rebound":
      return "🔄";
    case "steal":
      return "✋";
    case "block":
      return "🧱";
    case "foul":
      return "🚫";
    case "turnover":
      return "⚠️";
    case "period_start":
    case "period_end":
      return "📢";
    default:
      return "·";
  }
}

export function LiveMatch({
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
}: LiveMatchProps) {
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [playbackIndex, setPlaybackIndex] = useState(0); // 已展示的事件数
  const [speed, setSpeed] = useState<number>(1);
  const feedRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ready = Boolean(
    homeTeamId && awayTeamId && homeTacticId && awayTacticId,
  );

  const tacticName = (id: string | null): string => {
    if (!id || !tactics) return "未选择";
    return tactics.find((t) => t.id === id)?.name ?? id;
  };

  const homeName = teamLabel(homeTeam, homeTeamId);
  const awayName = teamLabel(awayTeam, awayTeamId);

  const allEvents = simResult?.pbp ?? [];
  const shownEvents = allEvents.slice(0, playbackIndex);
  const cur = currentEvent(shownEvents);

  const homeScore = cur?.scoreHome ?? 0;
  const awayScore = cur?.scoreAway ?? 0;
  const quarter = cur?.quarter ?? 1;
  const clock = cur?.clock ?? "12:00";
  const possessionTeamId = cur?.teamId;

  // 清理定时器
  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 播放推进
  useEffect(() => {
    if (playState !== "playing") return;
    if (playbackIndex >= allEvents.length) {
      setPlayState("finished");
      return;
    }
    const interval = BASE_INTERVAL / speed;
    timerRef.current = setInterval(() => {
      setPlaybackIndex((idx) => {
        const next = idx + 1;
        if (next >= allEvents.length) {
          clearTimer();
          setPlayState("finished");
          return allEvents.length;
        }
        return next;
      });
    }, interval);
    return clearTimer;
  }, [playState, speed, allEvents.length]);

  // 自动滚动到最新事件
  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      // 滚动到底部（最新事件在下方）
      el.scrollTop = el.scrollHeight;
    }
  }, [playbackIndex]);

  // 重新选择对阵/战术时重置回放
  useEffect(() => {
    setPlaybackIndex(0);
    setPlayState("idle");
    clearTimer();
  }, [homeTeamId, awayTeamId, homeTacticId, awayTacticId]);

  // simResult 变化时（新模拟完成），重置并自动开始播放
  useEffect(() => {
    if (simResult) {
      setPlaybackIndex(0);
      setPlayState("playing");
    }
  }, [simResult]);

  const handleStart = () => {
    if (!simResult) {
      onSimulate();
      return;
    }
    setPlaybackIndex(0);
    setPlayState("playing");
  };

  const handleTogglePlay = () => {
    if (playState === "playing") setPlayState("paused");
    else if (playState === "paused") setPlayState("playing");
    else if (playState === "finished") {
      setPlaybackIndex(0);
      setPlayState("playing");
    }
  };

  const handleSkipToEnd = () => {
    clearTimer();
    setPlaybackIndex(allEvents.length);
    setPlayState("finished");
  };

  const handleRestart = () => {
    clearTimer();
    setPlaybackIndex(0);
    setPlayState("playing");
  };

  // ── 渲染 ──

  if (!ready) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h2>比赛直播</h2>
          <span className="hint">先在「球队阵容」与「战术选择」完成对阵设置</span>
        </div>
        <div className="panel-body">
          <div className="live-empty">
            <div className="live-empty-icon">📺</div>
            <p>请先选择主客队与双方战术，然后开始直播</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>比赛直播</h2>
        <span className="hint">实时观看比赛进程</span>
      </div>
      <div className="panel-body">
        {/* 对阵摘要 */}
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

        {/* 未开始：开始按钮 */}
        {playState === "idle" && (
          <div className="live-start">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleStart}
              disabled={simLoading}
            >
              {simLoading ? "模拟中…" : simResult ? "观看直播回放" : "开始直播"}
            </button>
            {simError && (
              <div className="match-error">模拟失败：{simError}</div>
            )}
          </div>
        )}

        {/* 直播中/已结束 */}
        {playState !== "idle" && simResult && (
          <>
            {/* 实时比分牌 */}
            <div className="live-scoreboard">
              <div className="ls-team home">
                <span className="ls-tag">主</span>
                <span className="ls-name">{homeName}</span>
                <span className="ls-score">{homeScore}</span>
              </div>
              <div className="ls-center">
                <div className="ls-quarter">
                  {playState === "finished"
                    ? "全场结束"
                    : quarter <= 4
                      ? `第 ${quarter} 节`
                      : `加时 ${quarter - 4}`}
                </div>
                <div className="ls-clock">{clock}</div>
                <div className="ls-possession">
                  <span
                    className={`ls-dot${
                      possessionTeamId === homeTeamId ? " home" : ""
                    }${possessionTeamId === awayTeamId ? " away" : ""}`}
                  />
                  {possessionTeamId === homeTeamId && (
                    <span className="ls-pos-text home">{homeName} 进攻</span>
                  )}
                  {possessionTeamId === awayTeamId && (
                    <span className="ls-pos-text away">{awayName} 进攻</span>
                  )}
                  {possessionTeamId !== homeTeamId &&
                    possessionTeamId !== awayTeamId && (
                      <span className="ls-pos-text">—</span>
                    )}
                </div>
              </div>
              <div className="ls-team away">
                <span className="ls-score">{awayScore}</span>
                <span className="ls-name">{awayName}</span>
                <span className="ls-tag">客</span>
              </div>
            </div>

            {/* 控制栏 */}
            <div className="live-controls">
              <button
                type="button"
                className="btn"
                onClick={handleTogglePlay}
                disabled={playState === "loading"}
              >
                {playState === "playing" ? "⏸ 暂停" : playState === "finished" ? "↺ 重播" : "▶ 播放"}
              </button>
              <div className="live-speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`speed-btn${speed === s ? " is-active" : ""}`}
                    onClick={() => setSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <div className="live-progress">
                <div
                  className="live-progress-bar"
                  style={{
                    width: `${
                      allEvents.length > 0
                        ? (playbackIndex / allEvents.length) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <span className="live-progress-text">
                {playbackIndex} / {allEvents.length}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleSkipToEnd}
                disabled={playState === "finished"}
              >
                ⏭ 跳到结束
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleRestart}
              >
                ↺ 从头开始
              </button>
            </div>

            {/* 文字直播 */}
            <div className="live-pbp-wrap">
              <div className="live-pbp-header">
                <span className="live-pbp-title">文字直播</span>
                {playState === "playing" && (
                  <span className="live-live-dot">
                    <span className="pulse" /> LIVE
                  </span>
                )}
              </div>
              <div className="pbp-feed live-feed" ref={feedRef}>
                {shownEvents.map((ev, i) => {
                  const isNewest = i === playbackIndex - 1;
                  const sideClass =
                    ev.teamId === homeTeamId
                      ? "home"
                      : ev.teamId === awayTeamId
                        ? "away"
                        : "";
                  return (
                    <div
                      key={i}
                      className={`pbp-item ${sideClass}${isNewest ? " is-newest" : ""}`}
                    >
                      <span className="pbp-clock">
                        {eventIcon(ev.type)} {ev.clock}
                      </span>
                      <span className="pbp-desc">{ev.desc}</span>
                      <span className="pbp-score">
                        {ev.scoreHome}:{ev.scoreAway}
                      </span>
                    </div>
                  );
                })}
                {playState === "finished" && (
                  <div className="live-final">
                    🏁 比赛结束 · {homeName} {homeScore} : {awayScore} {awayName}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
