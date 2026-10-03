/**
 * TrainingPage —— 训练中心
 *
 * v0.6 设计：融合 basketpulse 单球员视图 + 整队训练表格
 * - 顶部：当日训练汇总卡（总成长点数 / 训练人数 / 设施倍率 / 职员加成）
 * - 中部：训练计划编辑（按位置 focus + 整队权重）
 * - 下部：整队训练表格（每个球员当日/近 7 日累计成长）+ Top 增长列表
 *
 * 参见：HWO_系统调整方案_v2.md §批次3
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchTrainingPlan,
  fetchTrainingToday,
  fetchTrainingLogs,
  putTrainingPlan,
  fetchTeam,
  fetchTeamStatsSummary,
} from "../api";
import type {
  TrainingPlanView,
  DailyTrainingSummary,
  TrainingLogEntry,
  TeamDetail,
  TeamStatsSummary,
} from "../types";

interface Props {
  teamId: string;
}

/** 能力 key 中文标签 */
const ABILITY_LABEL: Record<string, string> = {
  three: "三分",
  midrange: "中投",
  inside: "内线",
  drive: "突破",
  postup: "低位",
  passing: "传球",
  ballHandle: "控球",
  perimeterD: "外防",
  interiorD: "内防",
  steal: "抢断",
  block: "盖帽",
  speed: "速度",
  strength: "力量",
  jumping: "弹跳",
  stamina: "体能",
  iq: "球商",
  clutch: "关键",
};

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
const POS_LABEL: Record<string, string> = {
  PG: "控卫", SG: "分卫", SF: "小前", PF: "大前", C: "中锋",
};

const ABILITY_OPTIONS = [
  "three", "midrange", "inside", "drive", "postup", "passing",
  "ballHandle", "perimeterD", "interiorD", "steal", "block",
  "speed", "strength", "jumping", "stamina", "iq", "clutch",
];

export function TrainingPage({ teamId }: Props) {
  const [plan, setPlan] = useState<TrainingPlanView | null>(null);
  const [today, setToday] = useState<DailyTrainingSummary | null>(null);
  const [logs, setLogs] = useState<TrainingLogEntry[]>([]);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [summary, setSummary] = useState<TeamStatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dayFilter, setDayFilter] = useState<number | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, t, tm, ss] = await Promise.all([
        fetchTrainingPlan(teamId),
        fetchTrainingToday(teamId).catch(() => null),
        fetchTeam(teamId),
        fetchTeamStatsSummary(teamId).catch(() => null),
      ]);
      setPlan(p);
      setToday(t);
      setTeam(tm);
      setSummary(ss);
      // 训练日志默认按当天过滤；如果当日无日志，则查最近 30 条
      let logs = await fetchTrainingLogs(teamId, { limit: 50 });
      if (logs.length === 0) {
        logs = await fetchTrainingLogs(teamId, { limit: 30 });
      }
      setLogs(logs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDayFilter(day: number | "") {
    setDayFilter(day);
    if (day === "") {
      setLogs(await fetchTrainingLogs(teamId, { limit: 50 }));
    } else {
      setLogs(await fetchTrainingLogs(teamId, { day }));
    }
  }

  async function handleSavePlan() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await putTrainingPlan(teamId, {
        focusByPosition: plan.focusByPosition,
        teamFocus: plan.teamFocus,
      });
      setPlan(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载训练数据…
      </div>
    );
  }

  if (error && !plan) {
    return <div className="state error">{error}</div>;
  }

  // 聚合每个球员近 7 日累计成长（按 logs 数据）
  const playerGainsMap = new Map<string, { name: string; position: string; total: number; logs: TrainingLogEntry[] }>();
  for (const l of logs) {
    const cur = playerGainsMap.get(l.playerId) ?? {
      name: l.playerName,
      position: l.position,
      total: 0,
      logs: [],
    };
    cur.total += l.gain;
    cur.logs.push(l);
    playerGainsMap.set(l.playerId, cur);
  }

  // 合并球员 OVR 信息（从 team 详情中拿）
  const teamPlayerMap = new Map<string, { ovr: number | string; age?: number }>();
  if (team) {
    for (const p of team.players) {
      const ovr = typeof p.ovr === "number" ? p.ovr : (p.ovr as { est?: number })?.est ?? "—";
      teamPlayerMap.set(p.id, { ovr, age: undefined });
    }
  }

  // Top 6 成长球员
  const topGains = Array.from(playerGainsMap.entries())
    .map(([pid, g]) => ({ playerId: pid, ...g }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return (
    <div className="page training-page">
      <header className="page-head">
        <h2>训练中心</h2>
        <p className="muted">
          每日按训练计划小幅提升球员能力，受训练馆等级与职员加成影响。成长严格受潜力上限约束。
        </p>
      </header>

      {error && <div className="state error">{error}</div>}

      {/* 当日训练汇总卡 */}
      <section className="card training-today-card">
        <h3>当日训练</h3>
        {today ? (
          <div className="training-today-grid">
            <div className="tt-stat">
              <div className="tt-label">当日总成长</div>
              <div className="tt-val tt-val-primary">+{today.totalGains.toFixed(2)}</div>
            </div>
            <div className="tt-stat">
              <div className="tt-label">训练人数</div>
              <div className="tt-val">{today.playersTrained}</div>
            </div>
            <div className="tt-stat">
              <div className="tt-label">训练馆倍率</div>
              <div className="tt-val">×{today.facilityMultiplier.toFixed(2)}</div>
            </div>
            <div className="tt-stat">
              <div className="tt-label">职员训练加成</div>
              <div className="tt-val">+{(today.staffBonus * 100).toFixed(1)}%</div>
            </div>
            <div className="tt-stat">
              <div className="tt-label">第 {today.day} 日</div>
              <div className="tt-val muted">赛季日</div>
            </div>
            <div className="tt-top">
              <div className="tt-label">Top 增长</div>
              <ul className="tt-top-list">
                {today.topGains.length === 0 ? (
                  <li className="muted">暂无数据</li>
                ) : (
                  today.topGains.map((g, i) => (
                    <li key={i}>
                      <span className="tt-top-rank">#{i + 1}</span>
                      <span className="tt-top-name">{g.playerName}</span>
                      <span className="tt-top-ability">
                        {ABILITY_LABEL[g.ability] ?? g.ability}
                      </span>
                      <span className="tt-top-gain">+{g.gain.toFixed(2)}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div className="state muted">当日暂无训练数据</div>
        )}
      </section>

      {/* 训练计划编辑 */}
      {plan && (
        <section className="card training-plan-card">
          <h3>训练计划</h3>
          <p className="muted">
            为每个位置选择主攻能力，系统每日优先训练该能力；可选配置整队加权（0-4，影响整体成长倍率）。
          </p>
          <div className="grid grid-3">
            {POSITIONS.map((pos) => (
              <label key={pos} className="field">
                <span>{POS_LABEL[pos]} ({pos}) 主攻</span>
                <select
                  value={plan.focusByPosition[pos] ?? ""}
                  onChange={(e) => {
                    const next = { ...plan.focusByPosition, [pos]: e.target.value };
                    setPlan({ ...plan, focusByPosition: next });
                  }}
                >
                  {ABILITY_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {ABILITY_LABEL[a] ?? a}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="row gap" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handleSavePlan}
            >
              保存计划
            </button>
            <span className="muted" style={{ fontSize: 11 }}>
              更新时间：{new Date(plan.updatedAt).toLocaleString("zh-CN")}
            </span>
          </div>
        </section>
      )}

      {/* 整队训练表格 */}
      <section className="panel">
        <div className="panel-head">
          <h2>球员训练详情</h2>
          <div className="row gap" style={{ gap: 8 }}>
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: 11 }}>按日过滤</span>
              <input
                type="number"
                placeholder="日"
                value={dayFilter}
                onChange={(e) => handleDayFilter(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ width: 80 }}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleDayFilter("")}
            >
              全部
            </button>
          </div>
        </div>
        <div className="panel-body">
          {topGains.length === 0 ? (
            <div className="state">暂无训练日志（赛季尚未推进或全部球员已达潜力上限）</div>
          ) : (
            <div className="roster-table-wrap">
              <table className="stats-table training-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>位置</th>
                    <th>OVR</th>
                    <th>累计成长</th>
                    <th>训练条目</th>
                  </tr>
                </thead>
                <tbody>
                  {topGains.map((g) => {
                    const tp = teamPlayerMap.get(g.playerId);
                    return (
                      <tr key={g.playerId}>
                        <td className="st-name">{g.name}</td>
                        <td>
                          <span className="st-pos">{g.position}</span>
                        </td>
                        <td>{tp?.ovr ?? "—"}</td>
                        <td className="gain-cell">
                          +{g.total.toFixed(2)}
                        </td>
                        <td>
                          <ul className="ability-gains">
                            {g.logs.slice(0, 4).map((l, i) => (
                              <li key={i}>
                                <span className="ag-ability">
                                  {ABILITY_LABEL[l.abilityKey] ?? l.abilityKey}
                                </span>
                                <span className="ag-delta">
                                  +{l.gain.toFixed(2)}
                                </span>
                                <span className="ag-day muted">D{l.day}</span>
                              </li>
                            ))}
                            {g.logs.length > 4 && (
                              <li className="muted">+{g.logs.length - 4} 条</li>
                            )}
                          </ul>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
