/**
 * CareerPage —— 球员生涯面板
 *
 * - 展示球队所有球员的生涯信息：年龄 / 阶段 / OVR / 潜力 / 成长空间
 * - 手动训练球员（提升 OVR，仅成长阶段有效）
 * - 按生涯阶段分组：新秀 / 上升 / 巅峰 / 下滑 / 退役
 * - Drill 选择升级：每种训练项目对球员有适配度评级（A/B/C/D），
 *   评级基于球员位置（投篮对 SG/SF 更高、控球对 PG 更高、防守对 C/PF 更高）。
 *   评级影响训练效果（前端 mock：A=1.5x, B=1.2x, C=1.0x, D=0.7x），
 *   实际 OVR 变化由现有 postTrainPlayer API（sim 层）返回。
 */

import { useCallback, useEffect, useState } from "react";
import { fetchTeamCareers, postTrainPlayer } from "../api";
import { ovrVal } from "../lib";
import type { PlayerCareer, CareerStage, Position } from "../types";

interface Props {
  teamId: string;
}

const STAGE_ORDER: CareerStage[] = ["rookie", "rising", "prime", "decline", "retired"];
const STAGE_NAMES: Record<CareerStage, string> = {
  rookie: "新秀",
  rising: "上升",
  prime: "巅峰",
  decline: "下滑",
  retired: "退役",
};

const STAGE_COLORS: Record<CareerStage, string> = {
  rookie: "badge-new",
  rising: "badge-rise",
  prime: "badge-prime",
  decline: "badge-fall",
  retired: "badge-retire",
};

// ── Drill 库（前端展示用，实际训练效果由后端 drill 类型决定）──
type DrillId = "shooting" | "ballHandling" | "passing" | "defense" | "conditioning" | "allAround";
type DrillGrade = "A" | "B" | "C" | "D";

/** 前端 DrillId → 后端 DrillType 映射 */
const DRILL_TO_BACKEND: Record<DrillId, string> = {
  shooting: "shooting",
  ballHandling: "ball_handling",
  passing: "iq",
  defense: "defense",
  conditioning: "athletic",
  allAround: "athletic",
};

interface Drill {
  id: DrillId;
  name: string; // 中文名
  nameEn: string; // 英文名
  desc: string; // 提升的能力
  short: string; // 评级条短标签（单字）
  /** 各位置对该 Drill 的适配度评级（投篮对 SG/SF 高、控球对 PG 高、防守对 C/PF 高） */
  positionGrades: Record<Position, DrillGrade>;
}

const DRILLS: Drill[] = [
  {
    id: "shooting",
    name: "投篮训练",
    nameEn: "Shooting Drill",
    desc: "提升投篮能力（三分 / 中投）",
    short: "投",
    positionGrades: { PG: "B", SG: "A", SF: "A", PF: "C", C: "D" },
  },
  {
    id: "ballHandling",
    name: "控球训练",
    nameEn: "Ball Handling Drill",
    desc: "提升控球与突破能力",
    short: "控",
    positionGrades: { PG: "A", SG: "B", SF: "C", PF: "C", C: "D" },
  },
  {
    id: "passing",
    name: "传球训练",
    nameEn: "Passing Drill",
    desc: "提升传球与组织能力",
    short: "传",
    positionGrades: { PG: "A", SG: "B", SF: "B", PF: "C", C: "C" },
  },
  {
    id: "defense",
    name: "防守训练",
    nameEn: "Defense Drill",
    desc: "提升防守（外线 / 内线 / 抢断 / 盖帽）",
    short: "防",
    positionGrades: { PG: "C", SG: "C", SF: "B", PF: "A", C: "A" },
  },
  {
    id: "conditioning",
    name: "体能训练",
    nameEn: "Conditioning Drill",
    desc: "提升体能 / 速度 / 力量 / 弹跳",
    short: "体",
    positionGrades: { PG: "B", SG: "B", SF: "B", PF: "B", C: "B" },
  },
  {
    id: "allAround",
    name: "综合训练",
    nameEn: "All-Around Drill",
    desc: "均衡提升各项能力",
    short: "综",
    positionGrades: { PG: "B", SG: "B", SF: "B", PF: "B", C: "B" },
  },
];

/** 评级 → 训练效果倍率（前端 mock 投影，实际效果由 sim 层返回） */
const GRADE_MULTIPLIER: Record<DrillGrade, number> = {
  A: 1.5,
  B: 1.2,
  C: 1.0,
  D: 0.7,
};

const GRADE_RANK: Record<DrillGrade, number> = { A: 4, B: 3, C: 2, D: 1 };

function drillById(id: DrillId): Drill {
  return DRILLS.find((d) => d.id === id) ?? DRILLS[0];
}

/** 该位置下评级最高的 Drill（默认推荐） */
function bestDrillFor(position: Position): DrillId {
  let best = DRILLS[0].id;
  let bestRank = GRADE_RANK[DRILLS[0].positionGrades[position]];
  for (const d of DRILLS) {
    const r = GRADE_RANK[d.positionGrades[position]];
    if (r > bestRank) {
      best = d.id;
      bestRank = r;
    }
  }
  return best;
}

function gradeClass(g: DrillGrade): string {
  return `drill-grade-${g.toLowerCase()}`;
}

/** 属性 key → 中文标签 */
const ABILITY_LABELS: Record<string, string> = {
  three: "三分", midrange: "中投", inside: "内线", drive: "突破",
  postup: "低位", passing: "传球", ballHandle: "控球",
  perimeterD: "外线防守", interiorD: "内线防守", steal: "抢断", block: "盖帽",
  speed: "速度", strength: "力量", jumping: "弹跳", stamina: "体能", iq: "球商",
};
function abilityLabel(key: string): string {
  return ABILITY_LABELS[key] ?? key;
}

/** 可训练阶段：新秀 / 上升 / 巅峰 */
function isTrainableStage(stage: CareerStage): boolean {
  return stage === "rookie" || stage === "rising" || stage === "prime";
}

export function CareerPage({ teamId }: Props) {
  const [careers, setCareers] = useState<PlayerCareer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trainMsg, setTrainMsg] = useState<string | null>(null);
  /** 每位球员选中的 Drill（未选则回退到该位置评级最高的 Drill） */
  const [drillChoice, setDrillChoice] = useState<Partial<Record<string, DrillId>>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetchTeamCareers(teamId)
      .then(setCareers)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  function selectedDrillFor(playerId: string, position: Position): DrillId {
    return drillChoice[playerId] ?? bestDrillFor(position);
  }

  async function handleTrain(
    playerId: string,
    name: string,
    drill: Drill,
    grade: DrillGrade,
  ) {
    setBusyId(playerId);
    setTrainMsg(null);
    try {
      const backendDrill = DRILL_TO_BACKEND[drill.id];
      const r = await postTrainPlayer(playerId, backendDrill);
      const mult = GRADE_MULTIPLIER[grade];
      if (!r) {
        setTrainMsg(`${name} · ${drill.name} [${grade}]：无法训练`);
      } else if (r.improved) {
        // 展示具体属性变化
        const changes = r.attributeChanges
          .map((c) => `${abilityLabel(c.ability)} +${c.delta}`)
          .join("、");
        setTrainMsg(
          `${name} · ${r.drillLabel} [${grade}·${mult}x]：OVR ${r.ovrBefore} → ${r.ovrAfter} ✓ | ${changes}`,
        );
      } else {
        setTrainMsg(`${name} · ${drill.name} [${grade}]：已到成长上限（OVR ${r.ovrAfter}）`);
      }
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="state"><span className="spinner" /> 加载生涯数据…</div>;
  }

  // 按阶段分组
  const grouped: Record<CareerStage, PlayerCareer[]> = {
    rookie: [], rising: [], prime: [], decline: [], retired: [],
  };
  for (const c of careers) {
    grouped[c.stage]?.push(c);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h2>生涯面板</h2>
        <p className="muted">
          球员生涯弧线：新秀(19-22) → 上升(23-27) → 巅峰(28-32) → 下滑(33-36) → 退役(37+)
        </p>
        <div className="drill-legend">
          <span>训练 Drill 适配度：</span>
          <span className="drill-grade drill-grade-a">A</span><span>1.5x</span>
          <span className="drill-grade drill-grade-b">B</span><span>1.2x</span>
          <span className="drill-grade drill-grade-c">C</span><span>1.0x</span>
          <span className="drill-grade drill-grade-d">D</span><span>0.7x</span>
          <span className="muted">· 评级基于球员位置</span>
        </div>
      </header>

      {error && <div className="state error">{error}</div>}
      {trainMsg && <div className="state success">{trainMsg}</div>}

      {/* 退役仪式 */}
      {grouped.retired.length > 0 && (
        <section className="retirement-ceremony">
          <div className="ceremony-banner">
            <span className="ceremony-icon">🏀</span>
            <div>
              <h3>退役仪式</h3>
              <p className="muted">
                感谢以下球员为球队的付出，他们的球衣将永远悬挂在球馆上空。
              </p>
            </div>
          </div>
          <div className="retired-players">
            {grouped.retired.map((p) => (
              <div key={p.playerId} className="retired-card">
                <div className="jersey-retired">
                  <span className="jersey-number">{p.position}</span>
                </div>
                <div className="retired-info">
                  <strong>{p.name}</strong>
                  <span className="muted">{p.age} 岁 · 退役</span>
                </div>
                <div className="retired-stats">
                  <div><span>巅峰 OVR</span><strong>{ovrVal(p.ovr)}</strong></div>
                  <div><span>潜力</span><strong>{p.potential}</strong></div>
                  <div><span>训练经验</span><strong>{p.trainExp}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {careers.length === 0 ? (
        <div className="card"><p className="muted">球队暂无球员数据。</p></div>
      ) : (
        STAGE_ORDER.map((stage) => {
          const list = grouped[stage];
          if (list.length === 0) return null;
          const trainable = isTrainableStage(stage);
          return (
            <section key={stage} className="card">
              <h3>
                <span className={`badge ${STAGE_COLORS[stage]}`}>
                  {STAGE_NAMES[stage]}
                </span>
                <span className="muted"> · {list.length} 人</span>
              </h3>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>位置</th>
                    <th>年龄</th>
                    <th>OVR</th>
                    <th>潜力</th>
                    <th>成长空间</th>
                    <th>训练经验</th>
                    {trainable && <th>训练 Drill</th>}
                    {stage !== "retired" && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const selectedId = selectedDrillFor(p.playerId, p.position);
                    const selectedDrill = drillById(selectedId);
                    const selectedGrade = selectedDrill.positionGrades[p.position];
                    return (
                      <tr key={p.playerId}>
                        <td>{p.name}</td>
                        <td>{p.position}</td>
                        <td>{p.age}</td>
                        <td><strong>{ovrVal(p.ovr)}</strong></td>
                        <td>{p.potential}</td>
                        <td>
                          {p.growthRoom > 0 ? (
                            <span className="pos">+{p.growthRoom}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>{p.trainExp}</td>
                        {trainable && (
                          <td className="drill-cell">
                            <div className="drill-selector">
                              <select
                                className="drill-select"
                                value={selectedId}
                                disabled={busyId === p.playerId}
                                onChange={(e) =>
                                  setDrillChoice((prev) => ({
                                    ...prev,
                                    [p.playerId]: e.target.value as DrillId,
                                  }))
                                }
                              >
                                {DRILLS.map((d) => {
                                  const g = d.positionGrades[p.position];
                                  return (
                                    <option key={d.id} value={d.id}>
                                      {d.name} [{g}] · {GRADE_MULTIPLIER[g]}x
                                    </option>
                                  );
                                })}
                              </select>
                              <span
                                className={`drill-grade ${gradeClass(selectedGrade)}`}
                                title={`${selectedDrill.name} · 适配度 ${selectedGrade} · 效果 ${GRADE_MULTIPLIER[selectedGrade]}x`}
                              >
                                {selectedGrade}
                              </span>
                            </div>
                            <div className="drill-grade-strip">
                              {DRILLS.map((d) => {
                                const g = d.positionGrades[p.position];
                                return (
                                  <span
                                    key={d.id}
                                    className={`drill-grade-mini ${gradeClass(g)}`}
                                    title={`${d.name}：${g} · ${GRADE_MULTIPLIER[g]}x`}
                                  >
                                    {d.short}{g}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        )}
                        {stage !== "retired" && (
                          <td>
                            {trainable ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                disabled={busyId === p.playerId}
                                onClick={() =>
                                  handleTrain(p.playerId, p.name, selectedDrill, selectedGrade)
                                }
                              >
                                {busyId === p.playerId ? "训练中…" : "训练"}
                              </button>
                            ) : (
                              <span className="muted">不可训练</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </div>
  );
}
