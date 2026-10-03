/**
 * TeamPage — 球队管理页
 *
 * Tab 切换：阵容 / 战术 / 球员
 * - 阵容：LineupEditor 编辑首发 + 出场时间（仅可编辑自己球队）
 * - 战术：TacticSelector 让用户挑选战术预设（M1 仅展示，M2 持久化）
 * - 球员：PlayerGrid 展示球队所有球员卡片
 */

import { useEffect, useState } from "react";
import { fetchTactics, fetchTeam, putTeamCaptain, postScoutPlayer, updateTeam, updatePlayer } from "../api";
import type { PlayerDetail, TacticPreset, TeamDetail } from "../types";
import { useAuth } from "../auth/AuthContext";
import { LineupEditor } from "../components/LineupEditor";
import { TacticEditor } from "../components/TacticEditor";
import { PlayerSkillsTable } from "../components/PlayerSkillsTable";
import {
  DEFENSE_LABEL,
  OFFENSE_LABEL,
  TACTIC_CATEGORY_LABEL,
  TEMPO_LABEL,
} from "../lib";

type Tab = "lineup" | "tactics" | "players";

const TABS: { id: Tab; label: string }[] = [
  { id: "lineup", label: "阵容编辑" },
  { id: "tactics", label: "战术选择" },
  { id: "players", label: "球员详情" },
];

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

  const [tab, setTab] = useState<Tab>("lineup");
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [tactics, setTactics] = useState<TacticPreset[] | null>(null);
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
    </div>
  );
}
