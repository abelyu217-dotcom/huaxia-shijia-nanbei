/**
 * TeamPage — 球队管理页
 *
 * Tab 切换：球员详情 / 数据统计 / 青年球员 / 少年球员 / 合同管理
 * - 球员详情：PlayerSkillsTable 展示球队所有球员技能（basketpulse 风格）
 * - 数据统计：球队薪资总览 + 球员生涯统计
 * - 青年球员：age ≤ 18 的球员
 * - 少年球员：age ≤ 12 的球员
 * - 合同管理：合同列表 + 续约/裁退操作
 */

import { useEffect, useState } from "react";
import {
  fetchTeam,
  fetchTeamContracts,
  fetchTeamPlayerStats,
  fetchTeamSalary,
  putTeamCaptain,
  postScoutPlayer,
  postExtendContract,
  postWaivePlayer,
  updateTeam,
  updatePlayer,
} from "../api";
import type {
  Contract,
  PlayerDetail,
  PlayerSeasonStats,
  SalaryStatus,
  TeamDetail,
  WaiveResult,
} from "../types";
import { useAuth } from "../auth/AuthContext";
import { PlayerSkillsTable } from "../components/PlayerSkillsTable";

type Tab = "players" | "stats" | "youth" | "junior" | "contracts";

const TABS: { id: Tab; label: string }[] = [
  { id: "players", label: "球员详情" },
  { id: "stats", label: "数据统计" },
  { id: "youth", label: "青年球员" },
  { id: "junior", label: "少年球员" },
  { id: "contracts", label: "合同管理" },
];

/** 命中率配色分级 */
function pctTier(p: number): "pct-good" | "pct-mid" | "pct-bad" {
  if (p >= 0.5) return "pct-good";
  if (p >= 0.35) return "pct-mid";
  return "pct-bad";
}

/** 状态色 —— #13 状态色体系 */
const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  peak: { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "巅峰" },
  good: { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", label: "良好" },
  tired: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "疲劳" },
  exhausted: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "力竭" },
};

// 38 项档案分组（与 shared/types.ts PlayerProfile 字段一致）
const PROFILE_GROUPS: { key: string; label: string; fields: { key: string; label: string; unit?: string }[] }[] = [
  { key: "physical", label: "静态体测", fields: [
    { key: "heightCm", label: "身高", unit: "cm" }, { key: "armSpanCm", label: "臂展", unit: "cm" },
    { key: "standingReachCm", label: "摸高", unit: "cm" }, { key: "weightKg", label: "体重", unit: "kg" },
    { key: "frame", label: "骨架" }, { key: "handLength", label: "手长" }, { key: "achilles", label: "跟腱" },
  ]},
  { key: "athletic", label: "运动属性", fields: [
    { key: "speed", label: "速度" }, { key: "vertical", label: "弹跳" }, { key: "strength", label: "力量" },
    { key: "agility", label: "敏捷" }, { key: "stamina", label: "耐力" }, { key: "lateral", label: "横移" },
    { key: "burst", label: "爆发" }, { key: "flexibility", label: "柔韧" },
  ]},
  { key: "skill", label: "技术属性", fields: [
    { key: "three", label: "三分" }, { key: "midrange", label: "中投" }, { key: "freeThrow", label: "罚球" },
    { key: "layup", label: "上篮" }, { key: "dunk", label: "扣篮" }, { key: "passing", label: "传球" },
    { key: "ballHandle", label: "控球" }, { key: "rebounding", label: "篮板" }, { key: "steal", label: "抢断" },
    { key: "block", label: "盖帽" }, { key: "postUp", label: "低位" }, { key: "faceUp", label: "面框" },
    { key: "pickRoll", label: "挡拆" }, { key: "backToBasket", label: "背身" },
  ]},
  { key: "mental", label: "心智属性", fields: [
    { key: "workEthic", label: "敬业" }, { key: "pressure", label: "抗压" }, { key: "teamwork", label: "团队" },
    { key: "leadership", label: "领导力" }, { key: "iq", label: "球商" },
  ]},
  { key: "hidden", label: "隐藏属性", fields: [
    { key: "injuryProne", label: "伤病倾向" }, { key: "potential", label: "潜力" },
    { key: "personality", label: "性格" }, { key: "loyalty", label: "忠诚" },
  ]},
];

interface Props {
  teamId: string;
}

export function TeamPage({ teamId }: Props) {
  const { user } = useAuth();
  const isMine = user?.teamId === teamId;

  const [tab, setTab] = useState<Tab>("players");
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerSeasonStats[] | null>(null);
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [salary, setSalary] = useState<SalaryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 球队资料编辑
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [teamCityDraft, setTeamCityDraft] = useState("");
  const [teamEditError, setTeamEditError] = useState<string | null>(null);

  // 球员姓名编辑
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerNameDraft, setPlayerNameDraft] = useState("");
  const [playerEditError, setPlayerEditError] = useState<string | null>(null);

  // 38 项详细档案展开
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);

  // 合同管理：续约/裁退
  const [extendingContractId, setExtendingContractId] = useState<string | null>(null);
  const [extendYearsDraft, setExtendYearsDraft] = useState(1);
  const [extendSalaryDraft, setExtendSalaryDraft] = useState(0);
  const [contractOpError, setContractOpError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchTeam(teamId),
      fetchTeamPlayerStats(teamId).catch(() => [] as PlayerSeasonStats[]),
      isMine ? fetchTeamContracts(teamId) : Promise.resolve<Contract[]>([]),
      isMine ? fetchTeamSalary(teamId) : Promise.resolve<SalaryStatus | null>(null),
    ])
      .then(([t, ps, cts, sal]) => {
        if (cancelled) return;
        setTeam(t);
        setPlayerStats(ps);
        setContracts(cts);
        setSalary(sal);
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
  }, [teamId, isMine]);

  /** 开始续约：填入当前年薪作为默认值 */
  function startExtend(ct: Contract) {
    setContractOpError(null);
    setExtendYearsDraft(1);
    setExtendSalaryDraft(ct.salaryPerYear);
    setExtendingContractId(ct.id);
  }

  /** 提交续约 */
  async function handleExtend(contractId: string) {
    if (!team) return;
    setContractOpError(null);
    if (extendYearsDraft < 1 || extendYearsDraft > 5) {
      setContractOpError("续约年限需在 1-5 年之间");
      return;
    }
    if (extendSalaryDraft < 0) {
      setContractOpError("新年薪不能为负");
      return;
    }
    try {
      await postExtendContract(contractId, {
        addYears: extendYearsDraft,
        newSalaryPerYear: extendSalaryDraft,
      });
      // 刷新合同/薪资/球队
      const [cts, sal, t] = await Promise.all([
        fetchTeamContracts(team.id),
        fetchTeamSalary(team.id),
        fetchTeam(team.id),
      ]);
      setContracts(cts);
      setSalary(sal);
      setTeam(t);
      setExtendingContractId(null);
    } catch (e) {
      setContractOpError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 裁退球员 */
  async function handleWaive(
    contractId: string,
    playerName: string,
    waiveCost: number,
    yearsRemain: number,
    salaryPerYear: number,
  ) {
    if (!team) return;
    const costMsg =
      waiveCost > 0
        ? `\n\n裁员（买断）成本：${waiveCost.toLocaleString()} 万\n（剩余 ${yearsRemain} 年 × 年薪 ${salaryPerYear.toLocaleString()} 万 × 50%）\n此成本将占用薪资帽空间，操作不可撤销。`
        : "\n\n此操作不可撤销。";
    if (!window.confirm(`确认裁退「${playerName}」？${costMsg}`)) return;
    setContractOpError(null);
    try {
      const result: WaiveResult = await postWaivePlayer(contractId);
      // 刷新合同/薪资/球队
      const [cts, sal, t] = await Promise.all([
        fetchTeamContracts(team.id),
        fetchTeamSalary(team.id),
        fetchTeam(team.id),
      ]);
      setContracts(cts);
      setSalary(sal);
      setTeam(t);
      if (result.waiveCost > 0) {
        setContractOpError(
          `已裁退「${playerName}」，买断成本 ${result.waiveCost.toLocaleString()} 万已计入薪资帽。`,
        );
      }
    } catch (e) {
      setContractOpError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 设置/取消队长（#20） */
  async function handleSetCaptain(playerId: string | null) {
    if (!team) return;
    try {
      await putTeamCaptain(team.id, playerId);
      // 刷新球队数据
      const refreshed = await fetchTeam(team.id);
      setTeam(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 保存球队资料修改 */
  async function handleSaveTeam() {
    if (!team) return;
    setTeamEditError(null);
    try {
      const name = teamNameDraft.trim();
      const city = teamCityDraft.trim();
      const data: { name?: string; city?: string } = {};
      if (name) data.name = name;
      if (city) data.city = city;
      await updateTeam(team.id, data);
      const refreshed = await fetchTeam(team.id);
      setTeam(refreshed);
      setEditingTeam(false);
    } catch (e) {
      setTeamEditError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 开始编辑球队资料 */
  function startEditTeam() {
    if (!team) return;
    setTeamNameDraft(team.name);
    setTeamCityDraft(team.city ?? "");
    setTeamEditError(null);
    setEditingTeam(true);
  }

  /** 保存球员姓名修改 */
  async function handleSavePlayer(playerId: string) {
    if (!team) return;
    setPlayerEditError(null);
    const name = playerNameDraft.trim();
    if (!name) {
      setPlayerEditError("球员姓名不能为空");
      return;
    }
    try {
      await updatePlayer(team.id, playerId, name);
      const refreshed = await fetchTeam(team.id);
      setTeam(refreshed);
      setEditingPlayerId(null);
    } catch (e) {
      setPlayerEditError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 开始编辑球员姓名 */
  function startEditPlayer(player: PlayerDetail) {
    setPlayerNameDraft(player.name);
    setPlayerEditError(null);
    setEditingPlayerId(player.id);
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载球队数据…
      </div>
    );
  }
  if (error) {
    return <div className="state error">球队加载失败：{error}</div>;
  }
  if (!team) return null;

  return (
    <div className="team-page">
      <div className="team-page-head">
        <div>
          {editingTeam ? (
            <div className="team-edit-form">
              <input
                className="team-edit-input"
                value={teamNameDraft}
                onChange={(e) => setTeamNameDraft(e.target.value)}
                placeholder="球队名称"
              />
              <input
                className="team-edit-input"
                value={teamCityDraft}
                onChange={(e) => setTeamCityDraft(e.target.value)}
                placeholder="所在城市"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveTeam}>
                保存
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingTeam(false)}
              >
                取消
              </button>
              {teamEditError && <span className="error-text">{teamEditError}</span>}
            </div>
          ) : (
            <>
              <h2 className="team-page-name">{team.name}</h2>
              <span className="team-page-sub">
                {isMine ? "我的球队" : "其他球队（仅查看）"}
                {team.city ? ` · ${team.city}` : ""}
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isMine && !editingTeam && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={startEditTeam}>
              ✎ 编辑资料
            </button>
          )}
          <div className="team-page-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "players" && (
        <section className="panel">
          <div className="panel-head">
            <h2>球员详情</h2>
            <span className="hint">basketpulse 风格技能表 · 点击表头排序 · 支持导出</span>
          </div>
          <div className="panel-body">
            <PlayerSkillsTable
              players={team.players}
              exportName={`${team.name}-球员名单`}
              disablePagination={team.players.length <= 12}
              renderNameExtra={(p) => (
                <>
                  {/* 状态色 + 年薪 + 生涯阶段（仅本队可见） */}
                  {isMine && (
                    <div className="skills-row-meta">
                      {(() => {
                        const st = STATUS_STYLE[p.status ?? "good"];
                        return (
                          <span
                            className="chip status-chip"
                            style={{
                              color: st.color,
                              background: st.bg,
                              borderColor: st.bg,
                            }}
                          >
                            {st.label}
                          </span>
                        );
                      })()}
                      {p.salary != null && (
                        <span className="skills-salary" title="年薪（万）">
                          💰 {p.salary} 万
                        </span>
                      )}
                    </div>
                  )}
                  {/* 本队管理：改名 + 队长 */}
                  {isMine && (
                    <div className="skills-row-actions">
                      {editingPlayerId === p.id ? (
                        <>
                          <input
                            className="team-edit-input"
                            style={{ width: 140 }}
                            value={playerNameDraft}
                            autoFocus
                            onChange={(e) => setPlayerNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSavePlayer(p.id);
                              if (e.key === "Escape") setEditingPlayerId(null);
                            }}
                          />
                          <button
                            type="button"
                            className="btn-link captain-btn"
                            onClick={() => handleSavePlayer(p.id)}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="btn-link captain-btn"
                            onClick={() => setEditingPlayerId(null)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn-link captain-btn"
                          onClick={() => startEditPlayer(p)}
                        >
                          ✎ 改名
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-link captain-btn"
                        onClick={() => handleSetCaptain(p.isCaptain ? null : p.id)}
                      >
                        {p.isCaptain ? "取消队长" : "设为队长"}
                      </button>
                      {editingPlayerId === p.id && playerEditError && (
                        <span className="error-text" style={{ fontSize: 12 }}>
                          {playerEditError}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
              renderRowActions={(p) =>
                isMine && p.profile ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      setExpandedProfileId(expandedProfileId === p.id ? null : p.id)
                    }
                  >
                    {expandedProfileId === p.id ? "收起 ▲" : "档案 ▼"}
                  </button>
                ) : null
              }
              renderExtraRow={(p) => {
                if (!isMine || expandedProfileId !== p.id || !p.profile) return null;
                const prof = p.profile as unknown as Record<
                  string,
                  Record<string, number | string>
                >;
                return (
                  <div className="profile-groups">
                    {PROFILE_GROUPS.map((g) => (
                      <div className="profile-group" key={g.key}>
                        <div className="profile-group-label">{g.label}</div>
                        <div className="profile-field-grid">
                          {g.fields.map((f) => {
                            const v = prof[g.key]?.[f.key];
                            const display =
                              typeof v === "number"
                                ? g.key === "physical"
                                  ? `${v}${f.unit ? " " + f.unit : ""}`
                                  : String(Math.round(v))
                                : typeof v === "string"
                                ? v
                                : "—";
                            return (
                              <div className="profile-field" key={f.key} title={f.label}>
                                <span className="pf-label">{f.label}</span>
                                <span className="pf-val">{display}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }}
              onScout={
                !isMine
                  ? (playerId) => {
                      postScoutPlayer(playerId)
                        .then(() => fetchTeam(team.id))
                        .then((refreshed) => setTeam(refreshed))
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        );
                    }
                  : undefined
              }
            />
          </div>
        </section>
      )}

      {tab === "stats" && (
        <section className="panel">
          <div className="panel-head">
            <h2>数据统计</h2>
            <span className="hint">球员本赛季累计比赛数据（场均/命中率）</span>
          </div>
          <div className="panel-body">
            {/* 球员比赛累计统计 */}
            <h3 className="section-title" style={{ margin: "0 0 8px" }}>
              球员赛季统计
            </h3>
            {playerStats && playerStats.length > 0 ? (
              <div className="roster-table-wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>位置</th>
                      <th>年龄</th>
                      <th>GP</th>
                      <th>分钟</th>
                      <th>得分</th>
                      <th>篮板</th>
                      <th>助攻</th>
                      <th>抢断</th>
                      <th>盖帽</th>
                      <th>失误</th>
                      <th>投篮%</th>
                      <th>三分%</th>
                      <th>罚球%</th>
                      <th>+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((s) => (
                      <tr key={s.playerId}>
                        <td>{s.name}</td>
                        <td>{s.position}</td>
                        <td>{s.age ?? "—"}</td>
                        <td>{s.gp}</td>
                        <td>{s.avgMinutes.toFixed(1)}</td>
                        <td className="num-cell">
                          <strong>{s.avgPoints.toFixed(1)}</strong>
                          <span className="muted"> ({s.points})</span>
                        </td>
                        <td className="num-cell">
                          {s.avgRebounds.toFixed(1)}
                          <span className="muted"> ({s.rebounds})</span>
                        </td>
                        <td className="num-cell">
                          {s.avgAssists.toFixed(1)}
                          <span className="muted"> ({s.assists})</span>
                        </td>
                        <td>{s.avgSteals.toFixed(1)}</td>
                        <td>{s.avgBlocks.toFixed(1)}</td>
                        <td>{s.avgTurnovers.toFixed(1)}</td>
                        <td className={`pct-cell ${pctTier(s.fgPct)}`}>
                          {(s.fgPct * 100).toFixed(1)}%
                          <span className="muted">
                            {" "}{s.fgm}/{s.fga}
                          </span>
                        </td>
                        <td className={`pct-cell ${pctTier(s.tpPct)}`}>
                          {(s.tpPct * 100).toFixed(1)}%
                          <span className="muted">
                            {" "}{s.tpm}/{s.tpa}
                          </span>
                        </td>
                        <td className={`pct-cell ${pctTier(s.ftPct)}`}>
                          {(s.ftPct * 100).toFixed(1)}%
                          <span className="muted">
                            {" "}{s.ftm}/{s.fta}
                          </span>
                        </td>
                        <td className={s.plusMinus >= 0 ? "pos" : "neg"}>
                          {s.plusMinus > 0 ? "+" : ""}
                          {s.plusMinus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="state">暂无比赛数据（赛季尚未开始或无已结算比赛）</div>
            )}
            <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
              ⓘ 场均数据括号内为累计总数；命中率配色：≥50% 绿色 / 35-50% 黄色 / &lt;35% 红色
            </p>
          </div>
        </section>
      )}

      {tab === "youth" && (
        <section className="panel">
          <div className="panel-head">
            <h2>青年球员</h2>
            <span className="hint">年龄 ≤ 18 岁（来自青年训练营）</span>
          </div>
          <div className="panel-body">
            {(() => {
              const youth = team.players.filter(
                (p) => p.age != null && p.age <= 18,
              );
              if (youth.length === 0) {
                return <div className="state">暂无青年球员</div>;
              }
              return (
                <PlayerSkillsTable
                  players={youth}
                  exportName={`${team.name}-青年球员`}
                  disablePagination
                />
              );
            })()}
          </div>
        </section>
      )}

      {tab === "junior" && (
        <section className="panel">
          <div className="panel-head">
            <h2>少年球员</h2>
            <span className="hint">年龄 ≤ 12 岁（来自少年训练营）</span>
          </div>
          <div className="panel-body">
            {(() => {
              const junior = team.players.filter(
                (p) => p.age != null && p.age <= 12,
              );
              if (junior.length === 0) {
                return <div className="state">暂无少年球员</div>;
              }
              return (
                <PlayerSkillsTable
                  players={junior}
                  exportName={`${team.name}-少年球员`}
                  disablePagination
                />
              );
            })()}
          </div>
        </section>
      )}

      {tab === "contracts" && (
        <section className="panel">
          <div className="panel-head">
            <h2>合同管理</h2>
            <span className="hint">
              {isMine
                ? "管理本队球员合同：续约 / 裁退"
                : "仅查看：其他球队合同一览"}
            </span>
          </div>
          <div className="panel-body">
            {/* 薪资总览（仅本队） */}
            {isMine && salary && (
              <div className="kv-card">
                <h3 className="kv-card-title">球队薪资总览</h3>
                <div className="kv">
                  <div>
                    <dt>薪资帽</dt>
                    <dd>{salary.salaryCap.toLocaleString()} 万</dd>
                  </div>
                  <div>
                    <dt>总薪资</dt>
                    <dd>{salary.totalSalary.toLocaleString()} 万</dd>
                  </div>
                  <div>
                    <dt>占用</dt>
                    <dd>{salary.capHit.toLocaleString()} 万</dd>
                  </div>
                  <div>
                    <dt>剩余空间</dt>
                    <dd className={salary.remaining < 0 ? "neg" : "pos"}>
                      {salary.remaining.toLocaleString()} 万
                    </dd>
                  </div>
                  <div>
                    <dt>合同数</dt>
                    <dd>{salary.contractCount}</dd>
                  </div>
                </div>
              </div>
            )}

            {/* 合同列表 */}
            <h3 className="section-title" style={{ margin: "16px 0 8px" }}>
              合同列表
            </h3>
            {contracts && contracts.length > 0 ? (
              <div className="roster-table-wrap">
                <table className="contracts-table">
                  <thead>
                    <tr>
                      <th>球员</th>
                      <th>位置</th>
                      <th>年龄</th>
                      <th>总年限</th>
                      <th>剩余</th>
                      <th>年薪(万)</th>
                      <th>裁员成本(万)</th>
                      <th>状态</th>
                      <th>条款</th>
                      {isMine && <th>操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((ct) => (
                      <tr key={ct.id} className={`contract-row contract-${ct.status}`}>
                        <td>{ct.player?.name ?? "—"}</td>
                        <td>{ct.player?.position ?? "—"}</td>
                        <td>{ct.player?.age ?? "—"}</td>
                        <td>{ct.yearsTotal}</td>
                        <td className={ct.yearsRemain <= 1 ? "neg" : ""}>
                          {ct.yearsRemain}
                        </td>
                        <td>{ct.salaryPerYear.toLocaleString()}</td>
                        <td className={`waive-cost ${ct.status === "active" && (ct.waiveCost ?? 0) > 0 ? "has-cost" : ""}`}>
                          {ct.status === "active" && ct.waiveCost != null
                            ? ct.waiveCost.toLocaleString()
                            : "—"}
                        </td>
                        <td>
                          <span className={`status-chip contract-status-${ct.status}`}>
                            {ct.status === "active"
                              ? "生效中"
                              : ct.status === "expired"
                                ? "已到期"
                                : "已裁退"}
                          </span>
                        </td>
                        <td className="clause-list">
                          {ct.playerOption && <span className="chip">球员选项</span>}
                          {ct.teamOption && <span className="chip">球队选项</span>}
                          {ct.noTrade && <span className="chip">不可交易</span>}
                          {!ct.playerOption && !ct.teamOption && !ct.noTrade && (
                            <span className="muted">—</span>
                          )}
                        </td>
                        {isMine && (
                          <td>
                            {ct.status === "active" ? (
                              <div className="contract-actions">
                                {extendingContractId === ct.id ? (
                                  <div className="extend-form">
                                    <label className="extend-field">
                                      <span>续约年限</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={5}
                                        value={extendYearsDraft}
                                        onChange={(e) =>
                                          setExtendYearsDraft(+e.target.value)
                                        }
                                        style={{ width: 60 }}
                                      />
                                    </label>
                                    <label className="extend-field">
                                      <span>新年薪(万)</span>
                                      <input
                                        type="number"
                                        min={0}
                                        value={extendSalaryDraft}
                                        onChange={(e) =>
                                          setExtendSalaryDraft(+e.target.value)
                                        }
                                        style={{ width: 100 }}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      disabled={extendingContractId !== ct.id}
                                      onClick={() => handleExtend(ct.id)}
                                    >
                                      确认
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => setExtendingContractId(null)}
                                    >
                                      取消
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-link captain-btn"
                                      onClick={() => startExtend(ct)}
                                    >
                                      续约
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-link captain-btn waive-btn"
                                      onClick={() =>
                                        handleWaive(
                                          ct.id,
                                          ct.player?.name ?? "该球员",
                                          ct.waiveCost ?? 0,
                                          ct.yearsRemain,
                                          ct.salaryPerYear,
                                        )
                                      }
                                    >
                                      裁退
                                      {ct.waiveCost != null && ct.waiveCost > 0 && (
                                        <span className="waive-cost-tag">
                                          ({ct.waiveCost.toLocaleString()}万)
                                        </span>
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="state">暂无合同数据</div>
            )}
            {contractOpError && (
              <div className="error-text" style={{ marginTop: 8 }}>
                {contractOpError}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
