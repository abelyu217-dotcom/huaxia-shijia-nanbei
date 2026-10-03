/**
 * RelationshipPage —— 球员家庭与人际关系系统（P3-4）
 *
 * - 球队化学反应（基于队友羁绊）
 * - 球员关系网查询
 * - 球员士气计算
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchTeamChemistry,
  fetchPlayerNetwork,
  fetchPlayerMorale,
  fetchTeams,
  putPlayerFamily,
  postCreateRelationship,
} from "../api";
import type {
  TeamChemistryView,
  PlayerNetworkView,
  PlayerMoraleView,
  TeamRoster,
  RelationshipType,
} from "../types";

interface Props {
  teamId: string;
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  family: "家人",
  teammate: "队友",
  mentor: "师徒",
  rival: "宿敌",
  friend: "朋友",
  external: "外部",
};

const RELATIONSHIP_COLOR: Record<string, string> = {
  family: "#f472b6",
  teammate: "#4ade80",
  mentor: "#a78bfa",
  rival: "#ef4444",
  friend: "#60a5fa",
  external: "#94a3b8",
};

const BG_LABEL: Record<string, string> = {
  sports_family: "体育世家",
  normal: "普通家庭",
  single_parent: "单亲家庭",
  overseas: "留学背景",
  sports_school: "体校出身",
};

const REL_TYPES: RelationshipType[] = ["family", "teammate", "mentor", "rival", "friend", "external"];

function bondColor(bond: number): string {
  if (bond >= 75) return "#4ade80";
  if (bond >= 50) return "#fbbf24";
  if (bond >= 25) return "#fb923c";
  return "#ef4444";
}

export function RelationshipPage({ teamId }: Props) {
  const [chemistry, setChemistry] = useState<TeamChemistryView | null>(null);
  const [teams, setTeams] = useState<TeamRoster[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [network, setNetwork] = useState<PlayerNetworkView | null>(null);
  const [morale, setMorale] = useState<PlayerMoraleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 创建关系表单
  const [relTargetId, setRelTargetId] = useState("");
  const [relType, setRelType] = useState<RelationshipType>("teammate");
  const [relBond, setRelBond] = useState(50);
  const [relNote, setRelNote] = useState("");

  // 家庭背景表单
  const [familyBg, setFamilyBg] = useState("normal");

  const loadChemistry = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTeamChemistry(teamId), fetchTeams()])
      .then(([c, ts]) => {
        setChemistry(c);
        setTeams(ts);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    loadChemistry();
  }, [loadChemistry]);

  const loadPlayerDetail = useCallback((playerId: string) => {
    setDetailLoading(true);
    setError(null);
    Promise.all([fetchPlayerNetwork(playerId), fetchPlayerMorale(playerId)])
      .then(([n, m]) => {
        setNetwork(n);
        setMorale(m);
        setSelectedPlayerId(playerId);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDetailLoading(false));
  }, []);

  async function handleSetFamily() {
    if (!selectedPlayerId) return;
    setError(null);
    try {
      await putPlayerFamily(selectedPlayerId, familyBg);
      await loadPlayerDetail(selectedPlayerId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCreateRel() {
    if (!selectedPlayerId || !relTargetId) {
      setError("请选择目标球员");
      return;
    }
    setError(null);
    try {
      await postCreateRelationship({
        sourceId: selectedPlayerId,
        targetId: relTargetId,
        type: relType,
        bond: relBond,
        note: relNote || undefined,
      });
      setRelNote("");
      await loadPlayerDetail(selectedPlayerId);
      await loadChemistry();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // 获取所有球队的球员列表（用于关系目标选择）
  const allPlayers = teams.flatMap((t) =>
    t.players.map((p) => ({ ...p, teamName: t.name })),
  );

  if (loading) {
    return <div className="state"><span className="spinner" /> 加载中…</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>球员关系网</h2>
        <p className="page-sub">家庭背景 · 人际关系 · 化学反应 · 士气</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* 球队化学反应 */}
      {chemistry && (
        <section className="card">
          <div className="card-title">
            <span className="badge green">化学反应</span>
            <h3>球队化学反应</h3>
          </div>
          <div className="card-body">
            <div className="chemistry-score">
              <div
                className="chemistry-ring"
                style={{
                  background: `conic-gradient(${bondColor(chemistry.chemistry)} ${chemistry.chemistry * 3.6}deg, #1b2433 0deg)`,
                }}
              >
                <span>{chemistry.chemistry}</span>
              </div>
              <p className="muted">基于队友间羁绊值平均计算（0-100）</p>
            </div>

            {chemistry.details.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>球员</th>
                    <th>平均羁绊</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {chemistry.details.map((d) => (
                    <tr key={d.playerId}>
                      <td><b>{d.playerName}</b></td>
                      <td>
                        <span style={{ color: bondColor(d.avgBond), fontWeight: 600 }}>
                          {d.avgBond}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => loadPlayerDetail(d.playerId)}
                        >
                          查看关系
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* 球员关系详情 */}
      {selectedPlayerId && network && (
        <section className="card">
          <div className="card-title">
            <span className="badge pink">关系网</span>
            <h3>{network.playerName}（{network.position}）的关系网</h3>
          </div>
          <div className="card-body">
            {detailLoading && <div className="state"><span className="spinner" /> 加载中…</div>}

            {/* 士气 */}
            {morale && (
              <div className="morale-box">
                <div className="morale-score">
                  士气：<b style={{ color: bondColor(morale.morale) }}>{morale.morale}</b>
                </div>
                <div className="morale-factors muted">
                  家庭背景：{morale.factors.family ? BG_LABEL[morale.factors.family] ?? morale.factors.family : "未设置"} ·
                  关系数：{morale.factors.relationshipCount} ·
                  宿敌数：{morale.factors.rivalCount}
                </div>
              </div>
            )}

            {/* 家庭背景 */}
            <div className="subsection">
              <h4>家庭背景</h4>
              {network.family ? (
                <div>
                  <p>
                    <b>{network.family.backgroundLabel}</b>
                    {network.family.members.length > 0 && (
                      <span className="muted"> · {network.family.members.length} 名家庭成员</span>
                    )}
                  </p>
                  {network.family.members.length > 0 && (
                    <ul className="member-list">
                      {network.family.members.map((m, i) => (
                        <li key={i}>
                          <b>{m.name}</b>（{m.relation}，{m.age}岁）
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="muted">尚未设置家庭背景</p>
              )}
              <div className="form-row">
                <select value={familyBg} onChange={(e) => setFamilyBg(e.target.value)}>
                  {Object.entries(BG_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm" onClick={handleSetFamily}>
                  设置背景
                </button>
              </div>
            </div>

            {/* 人际关系列表 */}
            <div className="subsection">
              <h4>人际关系</h4>
              {Object.keys(network.relationships).length > 0 ? (
                <div className="relationship-groups">
                  {Object.entries(network.relationships).map(([type, edges]) => (
                    <div key={type} className="rel-group">
                      <h5 style={{ color: RELATIONSHIP_COLOR[type] }}>
                        {RELATIONSHIP_LABEL[type] ?? type}（{edges.length}）
                      </h5>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>对方球员</th>
                            <th>位置</th>
                            <th>羁绊</th>
                            <th>方向</th>
                            <th>备注</th>
                          </tr>
                        </thead>
                        <tbody>
                          {edges.map((e) => (
                            <tr key={e.id}>
                              <td><b>{e.otherPlayerName}</b></td>
                              <td>{e.otherPosition}</td>
                              <td>
                                <span style={{ color: bondColor(e.bond), fontWeight: 600 }}>
                                  {e.bond}
                                </span>
                              </td>
                              <td>{e.direction === "out" ? "→" : "←"}</td>
                              <td className="muted">{e.note ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">暂无人际关系记录</p>
              )}
            </div>

            {/* 创建关系 */}
            <div className="subsection">
              <h4>建立新关系</h4>
              <div className="form-grid">
                <select value={relTargetId} onChange={(e) => setRelTargetId(e.target.value)}>
                  <option value="">选择目标球员…</option>
                  {allPlayers
                    .filter((p) => p.id !== selectedPlayerId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}（{p.teamName}）
                      </option>
                    ))}
                </select>
                <select value={relType} onChange={(e) => setRelType(e.target.value as RelationshipType)}>
                  {REL_TYPES.map((t) => (
                    <option key={t} value={t}>{RELATIONSHIP_LABEL[t]}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="羁绊值 0-100"
                  value={relBond}
                  onChange={(e) => setRelBond(Math.max(0, Math.min(100, parseInt(e.target.value) || 50)))}
                />
                <input
                  type="text"
                  placeholder="备注（可选）"
                  value={relNote}
                  onChange={(e) => setRelNote(e.target.value)}
                />
                <button type="button" className="btn btn-primary" onClick={handleCreateRel}>
                  建立关系
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
