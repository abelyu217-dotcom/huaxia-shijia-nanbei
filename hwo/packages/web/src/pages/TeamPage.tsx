/**
 * TeamPage — 球队管理页
 *
 * Tab 切换：阵容 / 战术 / 球员
 * - 阵容：LineupEditor 编辑首发 + 出场时间（仅可编辑自己球队）
 * - 战术：TacticSelector 让用户挑选战术预设（M1 仅展示，M2 持久化）
 * - 球员：PlayerGrid 展示球队所有球员卡片
 */

import { useEffect, useMemo, useState } from "react";
import { fetchTactics, fetchTeam, putTeamCaptain, postScoutPlayer, updateTeam, updatePlayer } from "../api";
import type { Position, PlayerDetail, TacticPreset, TeamDetail } from "../types";
import { useAuth } from "../auth/AuthContext";
import { LineupEditor } from "../components/LineupEditor";
import { TacticEditor } from "../components/TacticEditor";
import {
  DEFENSE_LABEL,
  OFFENSE_LABEL,
  TACTIC_CATEGORY_LABEL,
  TEMPO_LABEL,
  abilityVal,
  ovrVal,
  isFoggedAbility,
} from "../lib";

type Tab = "lineup" | "tactics" | "players";

const TABS: { id: Tab; label: string }[] = [
  { id: "lineup", label: "阵容编辑" },
  { id: "tactics", label: "战术选择" },
  { id: "players", label: "球员详情" },
];

/** OVR 等级色 —— 参考 RA 评级色 */
function ovrColor(ovr: number): string {
  if (ovr >= 80) return "var(--ok)"; // 金色
  if (ovr >= 75) return "#a78bfa"; // 紫
  if (ovr >= 70) return "#60a5fa"; // 蓝
  if (ovr >= 65) return "#34d399"; // 绿
  return "var(--text-muted)";
}

/** 状态色 —— #13 状态色体系 */
const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  peak: { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "巅峰" },
  good: { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", label: "良好" },
  tired: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "疲劳" },
  exhausted: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "力竭" },
};

const POS_FILTERS: ("ALL" | Position)[] = ["ALL", "PG", "SG", "SF", "PF", "C"];

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

type SortKey = "name" | "position" | "ovr" | "salary" | "three" | "inside" | "perimeterD" | "speed";

interface Props {
  teamId: string;
}

export function TeamPage({ teamId }: Props) {
  const { user } = useAuth();
  const isMine = user?.teamId === teamId;

  const [tab, setTab] = useState<Tab>("lineup");
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [tactics, setTactics] = useState<TacticPreset[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<"ALL" | Position>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("ovr");
  const [sortAsc, setSortAsc] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTeam(teamId), fetchTactics()])
      .then(([t, ts]) => {
        if (cancelled) return;
        setTeam(t);
        setTactics(ts);
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
  }, [teamId]);

  // 阵容表格：位置筛选 + 排序（参考 Rim Attack Roster 表格视图）
  const visiblePlayers = useMemo(() => {
    if (!team) return [];
    const list = posFilter === "ALL" ? team.players : team.players.filter((p) => p.position === posFilter);
    const sorted = [...list];
    const getVal = (p: PlayerDetail): number | string => {
      const ab = p.abilities as Record<string, number | { est: number; range: number }>;
      switch (sortKey) {
        case "name": return p.name;
        case "position": return p.position;
        case "ovr": return ovrVal(p.ovr);
        case "salary": return p.salary ?? 0;
        case "three": return abilityVal(ab["three"]);
        case "inside": return abilityVal(ab["inside"]);
        case "perimeterD": return abilityVal(ab["perimeterD"]);
        case "speed": return abilityVal(ab["speed"]);
      }
    };
    sorted.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "string" && typeof vb === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return sorted;
  }, [team, posFilter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
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

      {tab === "lineup" && (
        <section className="panel">
          <div className="panel-head">
            <h2>首发阵容与出场时间</h2>
            <span className="hint">
              {isMine
                ? "勾选 5 名首发，调整出场时间（每人 0-48 min，总 200-240 min）"
                : "只读模式：你只能编辑自己球队的阵容"}
            </span>
          </div>
          <div className="panel-body">
            <LineupEditor teamId={teamId} editable={isMine} />
          </div>
        </section>
      )}

      {tab === "tactics" && isMine && <TacticEditor teamId={teamId} />}

      {tab === "tactics" && !isMine && (
        <section className="panel">
          <div className="panel-head">
            <h2>战术选择</h2>
            <span className="hint">仅查看：其他球队战术一览</span>
          </div>
          <div className="panel-body">
            {tactics ? (
              <div className="tactic-grid">
                {tactics.map((t) => (
                  <div key={t.id} className="tactic-card">
                    <div className="tc-names">
                      <span className="tc-name">{t.name}</span>
                      <span className="tc-name-en">{t.nameEn}</span>
                    </div>
                    <div className="tc-chips">
                      <span className="chip">
                        {TACTIC_CATEGORY_LABEL[t.category]}
                      </span>
                      <span className="chip tempo">
                        {TEMPO_LABEL[t.tempo]}
                      </span>
                      <span className="chip">
                        进攻 · {OFFENSE_LABEL[t.offenseTendency]}
                      </span>
                      <span className="chip">
                        防守 · {DEFENSE_LABEL[t.defenseTendency]}
                      </span>
                    </div>
                    <p className="tc-desc">{t.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="state">无战术数据</div>
            )}
          </div>
        </section>
      )}

      {tab === "players" && (
        <section className="panel">
          <div className="panel-head">
            <h2>球员详情</h2>
            <div className="roster-toolbar">
              <div className="pos-filters">
                {POS_FILTERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pos-filter${posFilter === p ? " is-active" : ""}`}
                    onClick={() => setPosFilter(p)}
                  >
                    {p === "ALL" ? "全部" : p}
                  </button>
                ))}
              </div>
              <span className="hint">{visiblePlayers.length} / {team.players.length} 名球员</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="roster-table-wrap">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("name")} className="sortable">姓名 {sortKey === "name" && (sortAsc ? "▲" : "▼")}</th>
                    <th onClick={() => toggleSort("position")} className="sortable">位置 {sortKey === "position" && (sortAsc ? "▲" : "▼")}</th>
                    <th onClick={() => toggleSort("ovr")} className="sortable">OVR {sortKey === "ovr" && (sortAsc ? "▲" : "▼")}</th>
                    <th>状态</th>
                    <th onClick={() => toggleSort("salary")} className="sortable">年薪(万) {sortKey === "salary" && (sortAsc ? "▲" : "▼")}</th>
                    <th onClick={() => toggleSort("three")} className="sortable">三分 {sortKey === "three" && (sortAsc ? "▲" : "▼")}</th>
                    <th onClick={() => toggleSort("inside")} className="sortable">内线 {sortKey === "inside" && (sortAsc ? "▲" : "▼")}</th>
                    <th onClick={() => toggleSort("perimeterD")} className="sortable">外防 {sortKey === "perimeterD" && (sortAsc ? "▲" : "▼")}</th>
                    <th onClick={() => toggleSort("speed")} className="sortable">速度 {sortKey === "speed" && (sortAsc ? "▲" : "▼")}</th>
                    {!isMine && <th>球探</th>}
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((p) => (
                    <tr key={p.id}>
                      <td className="cell-name">
                        <span className="player-tags">
                          {p.isCaptain && <span className="tag tag-captain" title="队长">C</span>}
                          {p.isRookie && <span className="tag tag-rookie" title="新秀">R</span>}
                          {isMine && editingPlayerId === p.id ? (
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
                          ) : (
                            <span>{p.name}</span>
                          )}
                        </span>
                        {isMine && (
                          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                            {editingPlayerId === p.id ? (
                              <>
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
                          </div>
                        )}
                        {isMine && editingPlayerId === p.id && playerEditError && (
                          <span className="error-text" style={{ fontSize: 12 }}>{playerEditError}</span>
                        )}
                      </td>
                      <td><span className="pos-badge">{p.position}</span></td>
                      <td className="cell-ovr" style={{ color: ovrColor(ovrVal(p.ovr)) }}>
                        {ovrVal(p.ovr)}
                        {typeof p.ovr === "object" && p.ovr && (
                          <span className="fog-range">±{Math.round(p.ovr.range)}</span>
                        )}
                      </td>
                      <td>
                        {(() => {
                          const st = STATUS_STYLE[p.status ?? "good"];
                          return (
                            <span className="chip status-chip" style={{ color: st.color, background: st.bg, borderColor: st.bg }}>
                              {st.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td>{p.salary ?? "—"}</td>
                      {(["three", "inside", "perimeterD", "speed"] as const).map((k) => {
                        const ab = p.abilities as Record<string, number | { est: number; range: number }>;
                        const v = ab[k];
                        return (
                          <td key={k}>
                            {abilityVal(v)}
                            {isFoggedAbility(v) && (
                              <span className="fog-range">±{Math.round(v.range)}</span>
                            )}
                          </td>
                        );
                      })}
                      {!isMine && (
                        <td>
                          <button
                            className="btn btn-sm btn-scout"
                            onClick={async () => {
                              try {
                                await postScoutPlayer(p.id);
                                const refreshed = await fetchTeam(team.id);
                                setTeam(refreshed);
                              } catch (e) {
                                setError(e instanceof Error ? e.message : String(e));
                              }
                            }}
                          >
                            🔍
                          </button>
                        </td>
                      )}
                      {isMine && p.profile && (
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              setExpandedProfileId(expandedProfileId === p.id ? null : p.id)
                            }
                          >
                            {expandedProfileId === p.id ? "收起 ▲" : "档案 ▼"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {isMine && expandedProfileId && (() => {
                    const p = team?.players.find((x) => x.id === expandedProfileId);
                    if (!p?.profile) return null;
                    const prof = p.profile as unknown as Record<string, Record<string, number | string>>;
                    return (
                      <tr key={`profile-${expandedProfileId}`} className="profile-expand-row">
                        <td colSpan={10} className="profile-expand-cell">
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
                        </td>
                      </tr>
                    );
                  })()}
                  {visiblePlayers.length === 0 && (
                    <tr><td colSpan={9} className="empty-row">该位置暂无球员</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
