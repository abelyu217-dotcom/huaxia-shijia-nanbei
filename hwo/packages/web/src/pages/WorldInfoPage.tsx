/**
 * WorldInfoPage — 世界资讯页
 *
 * 参考 Rim Attack 世界资讯页：
 *   - 多世界概览：fetchWorlds() 拿到 WorldInfo[]，每个世界一张卡片
 *     （世界名称 / ID / 球队数量 / 活跃球员数 / 球队列表，球队可点击跳转球队页）
 *   - 跨世界事件：前端根据世界列表与赛季状态 mock 生成事件流
 *     （如"世界1 赛季结束"、"世界2 选秀大会开始"）
 *   - 世界排行榜：fetchStandings() 显示当前世界积分榜
 *
 * 数据来源：
 *   - fetchWorlds()         → WorldInfo[]
 *   - fetchStandings()      → StandingRow[]
 *   - fetchCurrentSeason()  → SeasonInfo
 *
 * 页面不需要 props；可选 onOpenTeam 用于将球队点击接入路由跳转。
 */

import { useEffect, useMemo, useState } from "react";
import { fetchCurrentSeason, fetchStandings, fetchWorlds } from "../api";
import type {
  SeasonInfo,
  StandingRow,
  WorldInfo,
} from "../types";

/** 可选的球队跳转回调；未传入时球队以纯文本展示，页面仍可独立工作。 */
export interface WorldInfoPageProps {
  onOpenTeam?: (teamId: string) => void;
}

/** 跨世界事件（前端 mock）。 */
interface WorldEvent {
  id: string;
  worldId: string;
  worldName: string;
  title: string;
  desc: string;
  kind: "season_end" | "draft_start" | "playoff_start" | "trade_deadline" | "rookie_grad";
  /** 相对时间标签，仅用于展示。 */
  time: string;
}

const SEASON_STATUS_LABEL: Record<string, string> = {
  regular: "常规赛",
  playoff: "季后赛",
  offseason: "休赛期",
};

function seasonStatusLabel(status: string): string {
  return SEASON_STATUS_LABEL[status] ?? status;
}

const EVENT_KIND_LABEL: Record<WorldEvent["kind"], string> = {
  season_end: "赛季结束",
  draft_start: "选秀大会",
  playoff_start: "季后赛",
  trade_deadline: "交易截止",
  rookie_grad: "青训结业",
};

const EVENT_KIND_ICON: Record<WorldEvent["kind"], string> = {
  season_end: "🏆",
  draft_start: "🎯",
  playoff_start: "🔥",
  trade_deadline: "🔁",
  rookie_grad: "🌱",
};

/**
 * 估算世界活跃球员数：
 * 优先取 WorldInfo.teams[].playerCount（若后端扩展返回），求和；
 * 否则回退到 teams.length（按球队数推算）。
 */
function estimateActivePlayers(world: WorldInfo): number {
  let sum = 0;
  for (const t of world.teams) {
    const pc = (t as { playerCount?: number }).playerCount;
    if (typeof pc === "number" && pc > 0) sum += pc;
  }
  return sum > 0 ? sum : world.teams.length;
}

/**
 * 根据世界列表与各自赛季状态，前端 mock 跨世界事件流。
 * 参考示例："世界1 赛季结束"、"世界2 选秀大会开始"。
 */
function buildMockWorldEvents(worlds: WorldInfo[]): WorldEvent[] {
  const events: WorldEvent[] = [];
  worlds.forEach((w, idx) => {
    const day = idx + 1;
    switch (w.seasonStatus) {
      case "offseason":
        events.push({
          id: `${w.id}-season-end`,
          worldId: w.id,
          worldName: w.name,
          title: `${w.name} 赛季结束`,
          desc: `${w.seasonName} 已落幕，总冠军诞生，世界进入休赛期。`,
          kind: "season_end",
          time: `第 ${day} 日前`,
        });
        events.push({
          id: `${w.id}-draft-start`,
          worldId: w.id,
          worldName: w.name,
          title: `${w.name} 选秀大会开始`,
          desc: `${w.seasonName} 选秀大会即将开启，各队按乐透顺位挑选新秀。`,
          kind: "draft_start",
          time: `第 ${day} 日`,
        });
        events.push({
          id: `${w.id}-rookie-grad`,
          worldId: w.id,
          worldName: w.name,
          title: `${w.name} 青训学院结业`,
          desc: "各队青训学院产出新一批潜力新人，进入自由球员池。",
          kind: "rookie_grad",
          time: `第 ${day + 1} 日`,
        });
        break;
      case "playoff":
        events.push({
          id: `${w.id}-playoff-start`,
          worldId: w.id,
          worldName: w.name,
          title: `${w.name} 季后赛打响`,
          desc: `${w.seasonName} 进入季后赛阶段，东西部对决进行中。`,
          kind: "playoff_start",
          time: `第 ${day} 日`,
        });
        events.push({
          id: `${w.id}-trade-deadline`,
          worldId: w.id,
          worldName: w.name,
          title: `${w.name} 交易截止日临近`,
          desc: `${w.seasonName} 交易窗口即将关闭，多队酝酿最后补强。`,
          kind: "trade_deadline",
          time: `第 ${day + 2} 日`,
        });
        break;
      default:
        events.push({
          id: `${w.id}-trade-deadline`,
          worldId: w.id,
          worldName: w.name,
          title: `${w.name} 交易截止日临近`,
          desc: `${w.seasonName} 常规赛交易窗口即将关闭。`,
          kind: "trade_deadline",
          time: `第 ${day + 2} 日`,
        });
        events.push({
          id: `${w.id}-draft-start`,
          worldId: w.id,
          worldName: w.name,
          title: `${w.name} 选秀大会筹备中`,
          desc: `${w.seasonName} 赛季结束后将开启选秀大会，球探加紧考察新秀。`,
          kind: "draft_start",
          time: `第 ${day + 3} 日`,
        });
    }
  });
  return events;
}

export function WorldInfoPage({ onOpenTeam }: WorldInfoPageProps = {}) {
  const [worlds, setWorlds] = useState<WorldInfo[] | null>(null);
  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 主数据加载：世界 / 积分榜 / 赛季 并行
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchWorlds(), fetchStandings(), fetchCurrentSeason()])
      .then(([ws, st, se]) => {
        if (cancelled) return;
        setWorlds(ws);
        setStandings(st);
        setSeason(se);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 跨世界事件：基于世界列表 mock 生成
  const events = useMemo<WorldEvent[]>(() => {
    if (!worlds || worlds.length === 0) return [];
    return buildMockWorldEvents(worlds);
  }, [worlds]);

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 正在加载世界资讯…
      </div>
    );
  }
  if (error) {
    return <div className="state error">世界资讯加载失败：{error}</div>;
  }

  return (
    <div className="world-info-page">
      <div className="league-page-head">
        <h1>世界资讯</h1>
        {season && (
          <span className="league-page-sub">
            {season.displayName || season.name} · {seasonStatusLabel(season.status)}
          </span>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>多世界概览</h2>
          <span className="hint">
            {worlds ? `${worlds.length} 个世界` : "—"}
          </span>
        </div>
        <div className="panel-body">
          {!worlds || worlds.length === 0 ? (
            <div className="empty-block">暂无世界数据。</div>
          ) : (
            <div className="world-grid">
              {worlds.map((w) => (
                <article className="world-card" key={w.id}>
                  <header className="world-card-head">
                    <div className="world-card-title">
                      <span className="world-card-name" title={w.id}>
                        {w.name}
                      </span>
                      <span className="world-card-id">#{w.id}</span>
                      <span className="world-card-region" title="地区/国家">
                        {w.region || "CN"}
                      </span>
                    </div>
                    <span
                      className={`world-card-status status-${w.seasonStatus}`}
                    >
                      {seasonStatusLabel(w.seasonStatus)}
                    </span>
                  </header>

                  <dl className="kv world-card-kv">
                    <div>
                      <dt>赛季</dt>
                      <dd>{w.seasonName || "—"}</dd>
                    </div>
                    <div>
                      <dt>球队数量</dt>
                      <dd>{w.teamCount || w.teams.length}</dd>
                    </div>
                    <div>
                      <dt>活跃球员数</dt>
                      <dd>{estimateActivePlayers(w)}</dd>
                    </div>
                    {w.leagues.length > 0 && (
                      <div>
                        <dt>联赛层级</dt>
                        <dd>
                          {w.leagues
                            .filter((l) => l.type === "domestic")
                            .map((l) => `L${l.level}`)
                            .join(" · ") || "—"}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="world-card-teams">
                    <div className="world-card-teams-label">球队列表</div>
                    {w.teams.length === 0 ? (
                      <span className="muted">暂无球队</span>
                    ) : (
                      <ul className="world-team-list">
                        {w.teams.map((t) => {
                          const interactive = Boolean(onOpenTeam);
                          const cls = `world-team-chip${
                            interactive ? " is-link" : ""
                          }`;
                          return interactive ? (
                            <li key={t.id}>
                              <button
                                type="button"
                                className={cls}
                                onClick={() => onOpenTeam?.(t.id)}
                                title={`查看 ${t.name}`}
                              >
                                {t.name}
                              </button>
                            </li>
                          ) : (
                            <li key={t.id}>
                              <span className={cls}>{t.name}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel world-events">
        <div className="panel-head">
          <h2>跨世界事件</h2>
          <span className="hint">前端模拟事件流</span>
        </div>
        <div className="panel-body">
          {events.length === 0 ? (
            <div className="empty-block">暂无跨世界事件。</div>
          ) : (
            <ul className="world-event-list">
              {events.map((ev) => (
                <li className="world-event-item" key={ev.id}>
                  <span className="world-event-icon" aria-hidden>
                    {EVENT_KIND_ICON[ev.kind]}
                  </span>
                  <div className="world-event-main">
                    <div className="world-event-title">
                      <span className="world-event-world">{ev.worldName}</span>
                      <span className="world-event-kind">
                        {EVENT_KIND_LABEL[ev.kind]}
                      </span>
                    </div>
                    <p className="world-event-desc">{ev.desc}</p>
                  </div>
                  <span className="world-event-time">{ev.time}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>世界排行榜</h2>
          <span className="hint">当前世界积分榜</span>
        </div>
        <div className="panel-body">
          {!standings || standings.length === 0 ? (
            <div className="empty-block">尚无积分榜数据。推进一日以结算比赛。</div>
          ) : (
            <table className="standings-table league-standings-table">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th className="col-team">球队</th>
                  <th>胜</th>
                  <th>负</th>
                  <th>胜率</th>
                  <th>得分</th>
                  <th>失分</th>
                  <th>净胜分</th>
                  <th>近况</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r, i) => {
                  const diff = r.pointsFor - r.pointsAgainst;
                  return (
                    <tr key={r.teamId}>
                      <td className="col-rank">{i + 1}</td>
                      <td className="col-team">{r.teamName}</td>
                      <td>{r.wins}</td>
                      <td>{r.losses}</td>
                      <td>{(r.winRate * 100).toFixed(1)}%</td>
                      <td>{r.pointsFor}</td>
                      <td>{r.pointsAgainst}</td>
                      <td
                        className={
                          diff > 0 ? "diff-pos" : diff < 0 ? "diff-neg" : ""
                        }
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td>
                        <span
                          className={`streak-chip ${
                            r.streak?.startsWith("W") ? "win" : "loss"
                          }`}
                        >
                          {r.streak ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
