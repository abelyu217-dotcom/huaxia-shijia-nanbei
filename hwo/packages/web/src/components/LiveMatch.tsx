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

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  TeamDetail,
  TacticPreset,
  SimOutput,
  PbpEvent,
  PlayerDetail,
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

const SPEEDS = [1, 2, 4, 8, 16] as const;
const BASE_INTERVAL = 650; // 1x 时每事件间隔 ms

/** 球员实时统计（从已展示事件聚合） */
interface LivePlayerStat {
  pts: number;
  reb: number;
  ast: number;
  stl: number;   // 抢断
  blk: number;   // 盖帽
  to: number;    // 失误
  fgm: number;   // 命中（2分）
  fga: number;   // 出手（2分）
  tpm: number;   // 三分命中
  tpa: number;   // 三分出手
  ftm: number;   // 罚球命中
  fta: number;   // 罚球出手
}

/** 从 PBP 事件聚合球员实时统计 */
function computeLiveStats(events: PbpEvent[]): Map<string, LivePlayerStat> {
  const players = new Map<string, LivePlayerStat>();
  const get = (id: string): LivePlayerStat => {
    let s = players.get(id);
    if (!s) {
      s = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
      players.set(id, s);
    }
    return s;
  };

  for (const ev of events) {
    if (!ev.actorId) continue;
    const s = get(ev.actorId);
    switch (ev.type) {
      case "shot_made":
        s.pts += 2; s.fgm += 1; s.fga += 1; break;
      case "shot_miss":
        s.fga += 1; break;
      case "three_made":
        s.pts += 3; s.tpm += 1; s.tpa += 1; break;
      case "three_miss":
        s.tpa += 1; break;
      case "free_throw":
        s.fta += 1;
        if (ev.made) { s.pts += 1; s.ftm += 1; }
        break;
      case "rebound":
        s.reb += 1; break;
      case "steal":
        s.stl += 1; break;
      case "block":
        s.blk += 1; break;
      case "turnover":
        s.to += 1; break;
    }
    // 助攻：命中事件的 assistId
    if ((ev.type === "shot_made" || ev.type === "three_made") && ev.assistId) {
      get(ev.assistId).ast += 1;
    }
  }
  return players;
}

/** 按 teamId 统计球队犯规数 */
function countTeamFouls(events: PbpEvent[], teamId: string): number {
  return events.filter((e) => e.type === "foul" && e.teamId === teamId).length;
}

/** 取首发五人——生成器中 players 前 5 位即首发（PG→C 顺序） */
function startersOf(team: TeamDetail | null): PlayerDetail[] {
  if (!team) return [];
  return team.players.slice(0, 5);
}

function teamLabel(detail: TeamDetail | null, id: string | null): string {
  if (detail) return detail.name;
  if (id) return "加载中…";
  return "未选择";
}

/** 场上五人列——展示一支球队的 5 名首发及其实时分/板/助 */
function OnCourtColumn({
  side,
  teamName,
  players,
  stats,
}: {
  side: "home" | "away";
  teamName: string;
  players: PlayerDetail[];
  stats: Map<string, LivePlayerStat>;
}) {
  return (
    <div className={`oncourt oncourt-${side}`}>
      <div className="oncourt-head">
        <span className={`oc-tag ${side}`}>{side === "home" ? "主" : "客"}</span>
        <span className="oc-name">{teamName}</span>
        <span className="oc-sub">场上五人</span>
      </div>
      <div className="oncourt-list">
        {players.map((p) => {
          const s = stats.get(p.id) ?? { pts: 0, reb: 0, ast: 0 };
          return (
            <div key={p.id} className="oncourt-player">
              <span className="oc-pos">{p.position}</span>
              <span className="oc-pname">{p.name}</span>
              <span className="oc-stats">
                <b>{s.pts}</b> 分 · <b>{s.reb}</b> 板 · <b>{s.ast}</b> 助
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 技术统计表——展示两支球队所有球员的完整数据 */
function StatsTable({
  homeTeam,
  awayTeam,
  homeName,
  awayName,
  stats,
}: {
  homeTeam: TeamDetail | null;
  awayTeam: TeamDetail | null;
  homeName: string;
  awayName: string;
  stats: Map<string, LivePlayerStat>;
}) {
  const pct = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 100) : 0);

  const renderTeam = (team: TeamDetail | null, teamName: string, side: "home" | "away") => {
    const players = team?.players ?? [];
    let totals: LivePlayerStat = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
    players.forEach((p) => {
      const s = stats.get(p.id);
      if (s) {
        (Object.keys(totals) as (keyof LivePlayerStat)[]).forEach((k) => {
          totals[k] += s[k];
        });
      }
    });

    return (
      <div className="stats-team">
        <div className={`stats-team-head ${side}`}>{teamName}</div>
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>球员</th>
                <th>得分</th>
                <th>篮板</th>
                <th>助攻</th>
                <th>抢断</th>
                <th>盖帽</th>
                <th>失误</th>
                <th>两分</th>
                <th>三分</th>
                <th>罚球</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => {
                const s = stats.get(p.id) ?? { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
                const isStarter = i < 5;
                return (
                  <tr key={p.id} className={isStarter ? "is-starter" : ""}>
                    <td className="st-name">
                      <span className="st-pos">{p.position}</span>
                      {p.name}
                    </td>
                    <td className="st-num">{s.pts}</td>
                    <td className="st-num">{s.reb}</td>
                    <td className="st-num">{s.ast}</td>
                    <td className="st-num">{s.stl}</td>
                    <td className="st-num">{s.blk}</td>
                    <td className="st-num">{s.to}</td>
                    <td className="st-num">{s.fgm}-{s.fga} ({pct(s.fgm, s.fga)}%)</td>
                    <td className="st-num">{s.tpm}-{s.tpa} ({pct(s.tpm, s.tpa)}%)</td>
                    <td className="st-num">{s.ftm}-{s.fta} ({pct(s.ftm, s.fta)}%)</td>
                  </tr>
                );
              })}
              <tr className="st-total">
                <td className="st-name">球队总计</td>
                <td className="st-num">{totals.pts}</td>
                <td className="st-num">{totals.reb}</td>
                <td className="st-num">{totals.ast}</td>
                <td className="st-num">{totals.stl}</td>
                <td className="st-num">{totals.blk}</td>
                <td className="st-num">{totals.to}</td>
                <td className="st-num">{totals.fgm}-{totals.fga} ({pct(totals.fgm, totals.fga)}%)</td>
                <td className="st-num">{totals.tpm}-{totals.tpa} ({pct(totals.tpm, totals.tpa)}%)</td>
                <td className="st-num">{totals.ftm}-{totals.fta} ({pct(totals.ftm, totals.fta)}%)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="stats-tables">
      {renderTeam(homeTeam, homeName, "home")}
      {renderTeam(awayTeam, awayName, "away")}
    </div>
  );
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

/**
 * 生动事件文案——模拟 basketpulse 风格的描述性文字。
 * 优先用引擎生成的 desc，再根据事件类型补充更有画面感的措辞。
 */
function vividDesc(ev: PbpEvent, playerName?: string): string {
  const name = playerName ?? "";
  switch (ev.type) {
    case "shot_made":
      return `${name} 稳稳命中两分${ev.assistId ? "，队友妙传助攻" : ""}`;
    case "three_made":
      return `${name} 三分线外手起刀落，命中！${ev.assistId ? "（助攻）" : ""}`;
    case "shot_miss":
      return `${name} 投篮不中`;
    case "three_miss":
      return `${name} 三分出手，弹框而出`;
    case "free_throw":
      return ev.made
        ? `${name} 稳稳地罚中这一球`
        : `${name} 罚球不中`;
    case "rebound":
      return ev.reboundType === "off"
        ? `${name} 抢到进攻篮板`
        : `${name} 稳稳摘下防守篮板`;
    case "steal":
      return `${name} 眼疾手快，抢断成功！`;
    case "block":
      return `${name} 送出一记大帽！`;
    case "foul":
      return ev.desc || `${name} 犯规`;
    case "turnover":
      return ev.desc || `${name || ev.teamId} 失误`;
    case "period_start":
      return `第 ${ev.quarter} 节比赛开始`;
    case "period_end":
      return `第 ${ev.quarter} 节结束`;
    default:
      return ev.desc;
  }
}

/** 计算进攻时钟（24秒）——确定性：从最近一次重置事件反推 */
const SHOT_CLOCK_RESET_TYPES = new Set([
  "period_start",
  "shot_made",
  "three_made",
  "steal",
  "turnover",
]);

function shotClockFromEvent(
  ev: PbpEvent | null,
  allEvents: PbpEvent[],
): string {
  if (!ev) return "24";
  if (ev.type === "period_start" || ev.type === "period_end") return "24";

  // 找到上一次进攻时钟重置事件（节开始/命中/抢断/失误/防守篮板）
  let lastResetIdx = -1;
  for (let i = allEvents.length - 2; i >= 0; i--) {
    const e = allEvents[i];
    if (SHOT_CLOCK_RESET_TYPES.has(e.type)) {
      lastResetIdx = i;
      break;
    }
    if (e.type === "rebound" && e.reboundType !== "off") {
      lastResetIdx = i;
      break;
    }
  }

  if (lastResetIdx >= 0) {
    const reset = allEvents[lastResetIdx];
    // 进攻篮板后进攻时钟重置为 14 秒，其余情况为 24 秒
    const resetVal = reset.type === "rebound" && reset.reboundType === "off" ? 14 : 24;
    if (reset.clock && ev.clock) {
      const parse = (c: string) => {
        const [m, s] = c.split(":").map(Number);
        return (m ?? 0) * 60 + (s ?? 0);
      };
      const elapsed = parse(reset.clock) - parse(ev.clock);
      if (elapsed >= 0 && elapsed < resetVal) return String(resetVal - elapsed);
      if (elapsed >= resetVal) return "1";
    }
  }
  // 回退：用事件自身时钟的秒数做确定性映射
  if (ev.clock) {
    const secs = Number(ev.clock.split(":")[1]) || 0;
    return String(14 + (secs % 10));
  }
  return "20";
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
  const [activeTab, setActiveTab] = useState<"court" | "stats">("court");
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
  const shotClock = shotClockFromEvent(cur, shownEvents);

  // 球员名字查找表
  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    [...(homeTeam?.players ?? []), ...(awayTeam?.players ?? [])].forEach((p) => {
      map.set(p.id, p.name);
    });
    return map;
  }, [homeTeam, awayTeam]);

  // 分节比分（全 4 节）——只有已结束或当前进行中的节显示分值
  const quarterScores = useMemo(() => {
    const qs = simResult?.quarterScores;
    const home = [0, 0, 0, 0];
    const away = [0, 0, 0, 0];

    // 统计已结束的节次
    const endedQuarters = new Set<number>();
    for (const ev of shownEvents) {
      if (ev.type === "period_end" && ev.quarter <= 4) {
        endedQuarters.add(ev.quarter);
      }
    }

    if (qs) {
      for (let i = 0; i < 4; i++) {
        const q = i + 1;
        if (endedQuarters.has(q)) {
          // 已结束的节用最终值
          home[i] = qs.home[i] ?? 0;
          away[i] = qs.away[i] ?? 0;
        } else if (q === quarter && playState !== "finished") {
          // 当前进行中的节用实时分差
          let qStartHome = 0;
          let qStartAway = 0;
          for (const ev of shownEvents) {
            if (ev.type === "period_start" && ev.quarter === quarter) {
              qStartHome = ev.scoreHome;
              qStartAway = ev.scoreAway;
              break;
            }
          }
          home[i] = homeScore - qStartHome;
          away[i] = awayScore - qStartAway;
        } else if (playState === "finished") {
          home[i] = qs.home[i] ?? 0;
          away[i] = qs.away[i] ?? 0;
        }
        // 否则（未来的节）保持 0
      }
    }
    return { home, away };
  }, [simResult, quarter, homeScore, awayScore, shownEvents, cur, playState]);

  // 实时统计：球员分/板/助，球队犯规
  const liveStats = useMemo(() => computeLiveStats(shownEvents), [shownEvents]);
  const homeFouls = useMemo(
    () => (homeTeamId ? countTeamFouls(shownEvents, homeTeamId) : 0),
    [shownEvents, homeTeamId],
  );
  const awayFouls = useMemo(
    () => (awayTeamId ? countTeamFouls(shownEvents, awayTeamId) : 0),
    [shownEvents, awayTeamId],
  );

  // 进度条上的节次分界点（每节结束事件位置占比）
  const quarterMarks = useMemo(() => {
    if (allEvents.length === 0) return [] as number[];
    const marks: number[] = [];
    allEvents.forEach((ev, i) => {
      if (ev.type === "period_end") {
        marks.push((i / allEvents.length) * 100);
      }
    });
    return marks;
  }, [allEvents]);

  const homeStarters = startersOf(homeTeam);
  const awayStarters = startersOf(awayTeam);

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
                <span className="ls-fouls">犯 {homeFouls}</span>
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
                <div className="ls-shot-clock">
                  <span className="lsc-label">进攻</span>
                  <span className="lsc-value">{shotClock}</span>
                </div>
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
                <span className="ls-fouls">犯 {awayFouls}</span>
                <span className="ls-name">{awayName}</span>
                <span className="ls-tag">客</span>
              </div>
            </div>

            {/* 分节比分全表 */}
            <div className="live-quarter-table">
              <div className="lqt-row lqt-head">
                <span className="lqt-team">球队</span>
                {[1, 2, 3, 4].map((q) => (
                  <span key={q} className={`lqt-q${q === quarter ? " is-current" : ""}`}>
                    Q{q}
                  </span>
                ))}
                <span className="lqt-total">总计</span>
              </div>
              <div className="lqt-row">
                <span className="lqt-team home">{homeName}</span>
                {quarterScores.home.map((s, i) => (
                  <span key={i} className={`lqt-q${i === quarter - 1 ? " is-current" : ""}`}>
                    {s}
                  </span>
                ))}
                <span className="lqt-total home">{homeScore}</span>
              </div>
              <div className="lqt-row">
                <span className="lqt-team away">{awayName}</span>
                {quarterScores.away.map((s, i) => (
                  <span key={i} className={`lqt-q${i === quarter - 1 ? " is-current" : ""}`}>
                    {s}
                  </span>
                ))}
                <span className="lqt-total away">{awayScore}</span>
              </div>
            </div>

            {/* 标签切换：场上五人 / 技术统计 */}
            <div className="live-tabs">
              <button
                type="button"
                className={`live-tab${activeTab === "court" ? " is-active" : ""}`}
                onClick={() => setActiveTab("court")}
              >
                场上五人
              </button>
              <button
                type="button"
                className={`live-tab${activeTab === "stats" ? " is-active" : ""}`}
                onClick={() => setActiveTab("stats")}
              >
                技术统计
              </button>
            </div>

            {/* 标签内容 */}
            {activeTab === "court" ? (
              <div className="live-floor">
                <OnCourtColumn
                  side="home"
                  teamName={homeName}
                  players={homeStarters}
                  stats={liveStats}
                />
                <OnCourtColumn
                  side="away"
                  teamName={awayName}
                  players={awayStarters}
                  stats={liveStats}
                />
              </div>
            ) : (
              <StatsTable
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homeName={homeName}
                awayName={awayName}
                stats={liveStats}
              />
            )}

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
                {quarterMarks.map((m, i) => (
                  <span
                    key={i}
                    className="live-progress-mark"
                    style={{ left: `${m}%` }}
                    title={`第 ${i + 1} 节结束`}
                  />
                ))}
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

            {/* 文字直播——双栏布局 */}
            <div className="live-pbp-wrap">
              <div className="live-pbp-header">
                <span className="live-pbp-title">文字直播</span>
                {playState === "playing" && (
                  <span className="live-live-dot">
                    <span className="pulse" /> LIVE
                  </span>
                )}
              </div>
              <div className="pbp-dual" ref={feedRef}>
                {shownEvents.map((ev, i) => {
                  const isNewest = i === playbackIndex - 1;
                  const isHome = ev.teamId === homeTeamId;
                  const isAway = ev.teamId === awayTeamId;
                  const isNeutral = !isHome && !isAway;
                  const playerName = ev.actorId ? playerNames.get(ev.actorId) : undefined;
                  const desc = vividDesc(ev, playerName);

                  if (isNeutral) {
                    return (
                      <div
                        key={i}
                        className={`pbp-row pbp-neutral${isNewest ? " is-newest" : ""}`}
                      >
                        <span className="pbp-clock">{eventIcon(ev.type)} {ev.clock}</span>
                        <span className="pbp-desc">{desc}</span>
                        <span className="pbp-score">{ev.scoreHome}:{ev.scoreAway}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={i}
                      className={`pbp-row${isNewest ? " is-newest" : ""}`}
                    >
                      {/* 主队事件：左栏 */}
                      {isHome && (
                        <div className="pbp-side pbp-home">
                          <span className="pbp-side-icon">{eventIcon(ev.type)}</span>
                          <span className="pbp-side-desc">{desc}</span>
                        </div>
                      )}
                      {!isHome && <div className="pbp-side" />}

                      {/* 中间：时间 + 比分 */}
                      <div className="pbp-mid">
                        <span className="pbp-mid-clock">{ev.clock}</span>
                        <span className="pbp-mid-score">{ev.scoreHome}:{ev.scoreAway}</span>
                      </div>

                      {/* 客队事件：右栏 */}
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
                {playState === "finished" && (
                  <div className="pbp-row pbp-neutral live-final">
                    🏁 比赛结束 · {homeName} {homeScore} : {awayScore} {awayName}
                  </div>
                )}
              </div>
            </div>

            {/* 底部固定状态栏 */}
            <div className="live-bottom-bar">
              <span className="lbb-score">
                <b className="home">{homeScore}</b> : <b className="away">{awayScore}</b>
              </span>
              <span className="lbb-meta">
                {playState === "finished"
                  ? "全场结束"
                  : quarter <= 4
                    ? `第${quarter}节`
                    : `加时${quarter - 4}`}
                {playState !== "finished" && ` · ${clock}`}
              </span>
              <span className="lbb-possession">
                {possessionTeamId === homeTeamId && <span className="home">{homeName} 进攻</span>}
                {possessionTeamId === awayTeamId && <span className="away">{awayName} 进攻</span>}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
