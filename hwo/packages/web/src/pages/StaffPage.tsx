/**
 * StaffPage —— 职员中心
 *
 * v0.6 设计：
 * - 顶部：本队已雇佣职员列表（按 job 分组）
 * - 中部：可雇佣 NPC 池（按 job 筛选 + 排序）
 * - 操作：雇佣（扣签约费）/ 解雇（不退费）
 *
 * 参见：HWO_系统调整方案_v2.md §批次3
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchTeamStaff,
  fetchStaffPool,
  postStaffHire,
  postStaffFire,
} from "../api";
import type { StaffView, StaffJob } from "../types";

interface Props {
  teamId: string;
}

const JOB_LABEL: Record<StaffJob, string> = {
  head_coach: "主教练",
  asst_coach: "助理教练",
  trainer: "训练师",
  scout: "球探",
  agent: "经纪人",
};

const JOB_DESC: Record<StaffJob, string> = {
  head_coach: "训练成长 +2%/Lv（上限 30%）",
  asst_coach: "训练成长 +1.2%/Lv",
  trainer: "训练成长 +0.8%/Lv",
  scout: "球探精度 +4%/Lv",
  agent: "训练成长 +0.5%/Lv",
};

const JOB_ORDER: StaffJob[] = ["head_coach", "asst_coach", "trainer", "scout", "agent"];

export function StaffPage({ teamId }: Props) {
  const [teamStaff, setTeamStaff] = useState<StaffView[]>([]);
  const [pool, setPool] = useState<StaffView[]>([]);
  const [filter, setFilter] = useState<StaffJob | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([
        fetchTeamStaff(teamId),
        fetchStaffPool({ limit: 50 }),
      ]);
      setTeamStaff(s);
      setPool(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleHire(pro: StaffView) {
    if (!confirm(`确认雇佣 ${pro.jobLabel} (Lv${pro.level})？\n签约费 ${pro.signOnCost.toLocaleString()} 元将从现金账户扣除。`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postStaffHire(pro.id, teamId);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFire(pro: StaffView) {
    if (!confirm(`确认解雇 ${pro.jobLabel} (Lv${pro.level})？\n解约后不退签约费，请谨慎操作。`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postStaffFire(pro.id, teamId);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // 按职位分组已雇佣职员
  const teamStaffByJob = new Map<StaffJob, StaffView[]>();
  for (const s of teamStaff) {
    const arr = teamStaffByJob.get(s.job) ?? [];
    arr.push(s);
    teamStaffByJob.set(s.job, arr);
  }

  // 过滤后的可雇佣 NPC
  const filteredPool = filter ? pool.filter((p) => p.job === filter) : pool;

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载职员数据…
      </div>
    );
  }

  return (
    <div className="page staff-page">
      <header className="page-head">
        <h2>职员中心</h2>
        <p className="muted">
          雇佣教练 / 训练师 / 球探 / 经纪人提升球队训练效率与球探精度。签约费从现金账户扣除，每日财务结算自动扣薪。
        </p>
      </header>

      {error && <div className="state error">{error}</div>}

      {/* 本队已雇佣职员 */}
      <section className="card">
        <h3>本队职员（{teamStaff.length} 名）</h3>
        {teamStaff.length === 0 ? (
          <p className="muted">尚未雇佣任何职员，请从下方职员池雇佣。</p>
        ) : (
          <div className="roster-table-wrap">
            <table className="stats-table staff-table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>等级</th>
                  <th>声望</th>
                  <th>训练加成</th>
                  <th>球探加成</th>
                  <th>日薪</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {JOB_ORDER.map((job) => {
                  const arr = teamStaffByJob.get(job) ?? [];
                  return arr.map((s) => (
                    <tr key={s.id}>
                      <td className="st-name">{s.jobLabel}</td>
                      <td>
                        <span className="badge badge-big">Lv{s.level}</span>
                      </td>
                      <td>{s.proReputation}</td>
                      <td className="gain-cell">
                        {s.trainingBonus > 0 ? `+${(s.trainingBonus * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="gain-cell">
                        {s.scoutBonus > 0 ? `+${(s.scoutBonus * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td>{s.salaryPerDay.toLocaleString()} 元/日</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-danger"
                          disabled={busy}
                          onClick={() => handleFire(s)}
                        >
                          解雇
                        </button>
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 职员池 */}
      <section className="panel">
        <div className="panel-head">
          <h2>职员招募池</h2>
          <div className="row gap" style={{ gap: 8 }}>
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: 11 }}>职位筛选</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as StaffJob | "")}
              >
                <option value="">全部</option>
                {JOB_ORDER.map((j) => (
                  <option key={j} value={j}>{JOB_LABEL[j]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="panel-body">
          {filteredPool.length === 0 ? (
            <div className="state">暂无可雇佣职员</div>
          ) : (
            <div className="roster-table-wrap">
              <table className="stats-table staff-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>等级</th>
                    <th>声望</th>
                    <th>训练加成</th>
                    <th>球探加成</th>
                    <th>签约费</th>
                    <th>日薪</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPool.map((s) => (
                    <tr key={s.id}>
                      <td className="st-name">
                        {s.jobLabel}
                        <div className="muted" style={{ fontSize: 10 }}>
                          {JOB_DESC[s.job]}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-big">Lv{s.level}</span>
                      </td>
                      <td>{s.proReputation}</td>
                      <td className="gain-cell">
                        {s.trainingBonus > 0 ? `+${(s.trainingBonus * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="gain-cell">
                        {s.scoutBonus > 0 ? `+${(s.scoutBonus * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td>{s.signOnCost.toLocaleString()} 元</td>
                      <td>{s.salaryPerDay.toLocaleString()} 元/日</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy}
                          onClick={() => handleHire(s)}
                        >
                          雇佣
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
            ⓘ 每队最多：主教练 1 / 助理教练 2 / 训练师 2 / 球探 3 / 经纪人 1。雇佣后签约费从现金账户扣除，每日财务结算扣薪。
          </p>
        </div>
      </section>
    </div>
  );
}
