/**
 * IdentityPage —— 三身份系统（P3-1）
 *
 * - 经理身份：查看当前所属球队
 * - 球员化身：创建自定义球员进入本队
 * - 职业人身份：选择 11 职之一，转职、分配技能点
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchIdentity,
  fetchProfessions,
  postCreateAvatar,
  postChooseProfession,
  postSwitchProfession,
  postAddSkillPoint,
} from "../api";
import type { IdentityView, ProfessionDef } from "../types";

const LINE_LABEL: Record<string, string> = {
  tech: "技术线",
  biz: "商业线",
  media: "媒体线",
  gov: "政务线",
};

const LINE_COLOR: Record<string, string> = {
  tech: "#4ade80",
  biz: "#fbbf24",
  media: "#a78bfa",
  gov: "#60a5fa",
};

const STATUS_LABEL: Record<string, string> = {
  home_team: "本队效力",
  floated: "漂泊中",
  on_other_team: "效力他队",
  retired: "已退役",
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  unemployed: "待业",
  hired_by_manager: "被经理雇佣",
  preset_npc: "预设 NPC",
};

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
const POSITION_CN: Record<string, string> = {
  PG: "控卫", SG: "分卫", SF: "小前", PF: "大前", C: "中锋",
};

export function IdentityPage() {
  const [identity, setIdentity] = useState<IdentityView | null>(null);
  const [professions, setProfessions] = useState<ProfessionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 化身创建表单
  const [avatarName, setAvatarName] = useState("");
  const [avatarPosition, setAvatarPosition] = useState<string>("PG");

  // 转职目标
  const [switchJob, setSwitchJob] = useState("");

  // 技能点
  const [skillBranch, setSkillBranch] = useState("");
  const [skillPoints, setSkillPoints] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchIdentity(), fetchProfessions()])
      .then(([id, profs]) => {
        setIdentity(id);
        setProfessions(profs);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateAvatar() {
    if (!avatarName.trim()) {
      setError("请输入球员姓名");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postCreateAvatar({ name: avatarName.trim(), position: avatarPosition });
      setAvatarName("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseJob(job: string) {
    setBusy(true);
    setError(null);
    try {
      await postChooseProfession(job);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchJob() {
    if (!switchJob) {
      setError("请选择目标职业");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postSwitchProfession(switchJob);
      setSwitchJob("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSkill() {
    if (!skillBranch.trim()) {
      setError("请输入技能分支名");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postAddSkillPoint(skillBranch.trim(), skillPoints);
      setSkillBranch("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="state"><span className="spinner" /> 加载中…</div>;
  }

  if (!identity) {
    return <div className="state">无法加载身份信息</div>;
  }

  const pro = identity.professional;
  const avatar = identity.avatar;

  // 按职业线分组
  const professionsByLine = professions.reduce<Record<string, ProfessionDef[]>>((acc, p) => {
    (acc[p.line] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-header">
        <h2>三身份系统</h2>
        <p className="page-sub">经理 · 化身 · 职业人 — 三种身份共享同一账号</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* 经理身份 */}
      <section className="card">
        <div className="card-title">
          <span className="badge blue">经理</span>
          <h3>球队经理</h3>
        </div>
        <div className="card-body">
          {identity.manager.teamId ? (
            <p>
              当前球队：<b>{identity.manager.teamName}</b>
              <span className="muted">（{identity.manager.teamId}）</span>
            </p>
          ) : (
            <p className="muted">尚未认领球队</p>
          )}
        </div>
      </section>

      {/* 球员化身 */}
      <section className="card">
        <div className="card-title">
          <span className="badge green">化身</span>
          <h3>球员化身</h3>
        </div>
        <div className="card-body">
          {avatar.exists ? (
            <div className="info-grid">
              <div><span className="muted">球员姓名</span><b>{avatar.playerName}</b></div>
              <div><span className="muted">位置</span><b>{POSITION_CN[avatar.position ?? ""] ?? avatar.position}</b></div>
              <div><span className="muted">状态</span><b>{STATUS_LABEL[avatar.status ?? ""] ?? avatar.status}</b></div>
              <div><span className="muted">控制模式</span><b>{avatar.controlMode === "owner_controlled" ? "玩家控制" : "AI 控制"}</b></div>
            </div>
          ) : (
            <div>
              <p className="muted">尚未创建化身。创建后将有一名自定义球员加入本队。</p>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="球员姓名"
                  value={avatarName}
                  onChange={(e) => setAvatarName(e.target.value)}
                />
                <select
                  value={avatarPosition}
                  onChange={(e) => setAvatarPosition(e.target.value)}
                >
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>{p} · {POSITION_CN[p]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateAvatar}
                  disabled={busy}
                >
                  创建化身
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 职业人身份 */}
      <section className="card">
        <div className="card-title">
          <span className="badge purple">职业人</span>
          <h3>职业人身份</h3>
        </div>
        <div className="card-body">
          {pro.exists ? (
            <div>
              <div className="info-grid">
                <div><span className="muted">职业</span><b>{pro.jobName}</b></div>
                <div><span className="muted">职业线</span>
                  <span style={{ color: LINE_COLOR[pro.line ?? ""] }}>
                    {LINE_LABEL[pro.line ?? ""] ?? pro.line}
                  </span>
                </div>
                <div><span className="muted">等级</span><b>Lv.{pro.level}</b></div>
                <div><span className="muted">声望</span><b>{pro.proReputation}</b></div>
                <div><span className="muted">经验</span><b>{pro.experience}{pro.nextLevelExp ? ` / ${pro.nextLevelExp}` : ""}</b></div>
                <div><span className="muted">雇佣状态</span><b>{EMPLOYMENT_LABEL[pro.employmentStatus ?? ""] ?? pro.employmentStatus}</b></div>
              </div>

              {/* 转职 */}
              <div className="subsection">
                <h4>转职</h4>
                <p className="muted">跨线转职损失 30% 经验，同线无损；转职后声望归零。</p>
                <div className="form-row">
                  <select value={switchJob} onChange={(e) => setSwitchJob(e.target.value)}>
                    <option value="">选择目标职业…</option>
                    {professions.filter((p) => p.job !== pro.job).map((p) => (
                      <option key={p.job} value={p.job}>
                        [{LINE_LABEL[p.line]}] {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleSwitchJob}
                    disabled={busy || !switchJob}
                  >
                    确认转职
                  </button>
                </div>
              </div>

              {/* 技能点 */}
              <div className="subsection">
                <h4>分配技能点</h4>
                <div className="form-row">
                  <input
                    type="text"
                    placeholder="技能分支名（如 shooting、defense）"
                    value={skillBranch}
                    onChange={(e) => setSkillBranch(e.target.value)}
                  />
                  <input
                    type="number"
                    min={1}
                    value={skillPoints}
                    onChange={(e) => setSkillPoints(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={handleAddSkill}
                    disabled={busy}
                  >
                    加点
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="muted">尚未选择职业。从 11 个职业中选择一个开始你的第二人生。</p>
              <div className="profession-grid">
                {Object.entries(professionsByLine).map(([line, profs]) => (
                  <div key={line} className="profession-line">
                    <h4 style={{ color: LINE_COLOR[line] }}>{LINE_LABEL[line] ?? line}</h4>
                    <div className="profession-list">
                      {profs.map((p) => (
                        <button
                          key={p.job}
                          type="button"
                          className="profession-card"
                          onClick={() => handleChooseJob(p.job)}
                          disabled={busy}
                          title={p.desc}
                        >
                          <b>{p.name}</b>
                          <span className="muted">{p.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
