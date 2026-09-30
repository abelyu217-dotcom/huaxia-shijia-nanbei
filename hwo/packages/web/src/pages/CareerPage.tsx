/**
 * CareerPage —— 球员生涯面板
 *
 * - 展示球队所有球员的生涯信息：年龄 / 阶段 / OVR / 潜力 / 成长空间
 * - 手动训练球员（提升 OVR，仅成长阶段有效）
 * - 按生涯阶段分组：新秀 / 上升 / 巅峰 / 下滑 / 退役
 */

import { useCallback, useEffect, useState } from "react";
import { fetchTeamCareers, postTrainPlayer } from "../api";
import type { PlayerCareer, CareerStage } from "../types";

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

export function CareerPage({ teamId }: Props) {
  const [careers, setCareers] = useState<PlayerCareer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trainMsg, setTrainMsg] = useState<string | null>(null);

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

  async function handleTrain(playerId: string, name: string) {
    setBusyId(playerId);
    setTrainMsg(null);
    try {
      const r = await postTrainPlayer(playerId);
      if (!r) {
        setTrainMsg(`${name}：无法训练`);
      } else if (r.improved) {
        setTrainMsg(`${name}：OVR ${r.ovrBefore} → ${r.ovrAfter} ✓`);
      } else {
        setTrainMsg(`${name}：已到成长上限（OVR ${r.ovrAfter}）`);
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
                  <div><span>巅峰 OVR</span><strong>{p.ovr}</strong></div>
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
                    {stage !== "retired" && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.playerId}>
                      <td>{p.name}</td>
                      <td>{p.position}</td>
                      <td>{p.age}</td>
                      <td><strong>{p.ovr}</strong></td>
                      <td>{p.potential}</td>
                      <td>
                        {p.growthRoom > 0 ? (
                          <span className="pos">+{p.growthRoom}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{p.trainExp}</td>
                      {stage !== "retired" && (
                        <td>
                          {stage === "rookie" || stage === "rising" || stage === "prime" ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={busyId === p.playerId}
                              onClick={() => handleTrain(p.playerId, p.name)}
                            >
                              {busyId === p.playerId ? "训练中…" : "训练"}
                            </button>
                          ) : (
                            <span className="muted">不可训练</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </div>
  );
}
