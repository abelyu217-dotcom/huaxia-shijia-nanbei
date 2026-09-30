/**
 * TeamPage — 球队管理页
 *
 * Tab 切换：阵容 / 战术 / 球员
 * - 阵容：LineupEditor 编辑首发 + 出场时间（仅可编辑自己球队）
 * - 战术：TacticSelector 让用户挑选战术预设（M1 仅展示，M2 持久化）
 * - 球员：PlayerGrid 展示球队所有球员卡片
 */

import { useEffect, useMemo, useState } from "react";
import { fetchTactics, fetchTeam, putTeamCaptain } from "../api";
import type { Position, PlayerDetail, TacticPreset, TeamDetail } from "../types";
import { useAuth } from "../auth/AuthContext";
import { LineupEditor } from "../components/LineupEditor";
import { TacticEditor } from "../components/TacticEditor";
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
      switch (sortKey) {
        case "name": return p.name;
        case "position": return p.position;
        case "ovr": return p.ovr;
        case "salary": return p.salary ?? 0;
        case "three": return p.abilities.three;
        case "inside": return p.abilities.inside;
        case "perimeterD": return p.abilities.perimeterD;
        case "speed": return p.abilities.speed;
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
          <h2 className="team-page-name">{team.name}</h2>
          <span className="team-page-sub">
            {isMine ? "我的球队" : "其他球队（仅查看）"}
          </span>
        </div>
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
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((p) => (
                    <tr key={p.id}>
                      <td className="cell-name">
                        <span className="player-tags">
                          {p.isCaptain && <span className="tag tag-captain" title="队长">C</span>}
                          {p.isRookie && <span className="tag tag-rookie" title="新秀">R</span>}
                          <span>{p.name}</span>
                        </span>
                        {isMine && (
                          <button
                            type="button"
                            className="btn-link captain-btn"
                            onClick={() => handleSetCaptain(p.isCaptain ? null : p.id)}
                          >
                            {p.isCaptain ? "取消队长" : "设为队长"}
                          </button>
                        )}
                      </td>
                      <td><span className="pos-badge">{p.position}</span></td>
                      <td className="cell-ovr" style={{ color: ovrColor(p.ovr) }}>{p.ovr}</td>
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
                      <td>{p.abilities.three}</td>
                      <td>{p.abilities.inside}</td>
                      <td>{p.abilities.perimeterD}</td>
                      <td>{p.abilities.speed}</td>
                    </tr>
                  ))}
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
