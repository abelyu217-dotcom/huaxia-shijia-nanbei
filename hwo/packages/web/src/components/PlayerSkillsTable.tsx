/**
 * 球员技能表（参考 basketpulse.com/hk/Players/skills）
 *
 * - 顶部工具栏：姓名搜索 + 位置筛选
 * - 表格列：姓名 / 位置 / OVR / 各项能力值（数字 + 颜色编码单元格）
 * - 表头可点击排序，分页浏览
 * - 支持 The Fog 迷雾估值（带 ± 范围显示）
 */

import { useMemo, useState } from "react";
import type { PlayerDetail, Position, Abilities, FogValue } from "../types";
import {
  KEY_ABILITIES,
  POSITION_LABEL,
  abilityVal,
  isFoggedAbility,
  ovrVal,
  ovrTier,
} from "../lib";

const POS_FILTERS: ("ALL" | Position)[] = ["ALL", "PG", "SG", "SF", "PF", "C"];
const PAGE_SIZE = 10;

type SortKey = "name" | "position" | "ovr" | keyof Abilities;

interface Props {
  players: PlayerDetail[];
  /** 球队侧标签（主/客），用于表头标识 */
  side?: "home" | "away";
  /** 是否显示球探按钮（对手球员） */
  onScout?: (playerId: string) => void;
}

/** 按 basketpulse 风格为能力值分配颜色档位 */
function skillTier(val: number): "s" | "a" | "b" | "c" | "d" {
  if (val >= 90) return "s";
  if (val >= 80) return "a";
  if (val >= 70) return "b";
  if (val >= 60) return "c";
  return "d";
}

export function PlayerSkillsTable({ players, side, onScout }: Props) {
  const [keyword, setKeyword] = useState("");
  const [posFilter, setPosFilter] = useState<"ALL" | Position>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("ovr");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let list = players;
    if (kw) list = list.filter((p) => p.name.toLowerCase().includes(kw));
    if (posFilter !== "ALL") list = list.filter((p) => p.position === posFilter);

    const sorted = [...list];
    const getVal = (p: PlayerDetail): number | string => {
      const ab = p.abilities as Record<string, number | { est: number; range: number }>;
      switch (sortKey) {
        case "name": return p.name;
        case "position": return p.position;
        case "ovr": return ovrVal(p.ovr);
        default: return abilityVal(ab[sortKey as string]);
      }
    };
    sorted.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "string" && typeof vb === "string") {
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return sorted;
  }, [players, keyword, posFilter, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  function resetPage() { setPage(1); }

  return (
    <div className="skills-table-wrap">
      <div className="skills-toolbar">
        <input
          type="text"
          className="skills-search"
          placeholder="搜索球员姓名…"
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); resetPage(); }}
        />
        <div className="pos-filters">
          {POS_FILTERS.map((p) => (
            <button
              key={p}
              type="button"
              className={`pos-filter${posFilter === p ? " is-active" : ""}`}
              onClick={() => { setPosFilter(p); resetPage(); }}
            >
              {p === "ALL" ? "全部" : p}
            </button>
          ))}
        </div>
        <span className="skills-count">
          {filtered.length} / {players.length} 人
        </span>
      </div>

      <div className="roster-table-wrap">
        <table className="skills-table">
          <thead>
            <tr>
              <th
                className={`sortable${sortKey === "name" ? " is-active" : ""}`}
                onClick={() => toggleSort("name")}
              >
                姓名 {sortKey === "name" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                className={`sortable${sortKey === "position" ? " is-active" : ""}`}
                onClick={() => toggleSort("position")}
              >
                位置 {sortKey === "position" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                className={`sortable${sortKey === "ovr" ? " is-active" : ""}`}
                onClick={() => toggleSort("ovr")}
              >
                OVR {sortKey === "ovr" && (sortAsc ? "▲" : "▼")}
              </th>
              {KEY_ABILITIES.map((ab) => (
                <th
                  key={ab.key}
                  className={`sortable skill-col${sortKey === ab.key ? " is-active" : ""}`}
                  onClick={() => toggleSort(ab.key)}
                  title={ab.label}
                >
                  {ab.label} {sortKey === ab.key && (sortAsc ? "▲" : "▼")}
                </th>
              ))}
              {onScout && <th>球探</th>}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((p) => {
              const ov = ovrVal(p.ovr);
              const tier = ovrTier(ov);
              const ovrFogged = typeof p.ovr === "object" && p.ovr !== null;
              return (
                <tr key={p.id} className={`tier-row tier-${tier}${ovrFogged ? " is-fogged" : ""}`}>
                  <td className="cell-name">
                    <span className="player-tags">
                      {p.isCaptain && <span className="tag tag-captain" title="队长">C</span>}
                      {p.isRookie && <span className="tag tag-rookie" title="新秀">R</span>}
                      <span className="player-name" title={p.name}>{p.name}</span>
                      {ovrFogged && (
                        <span className="fog-badge" title="未探查">雾</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="pos-badge">{p.position}</span>
                    <span className="pos-label">{POSITION_LABEL[p.position]}</span>
                  </td>
                  <td className="cell-ovr">
                    <span className="ovr-pill">{ov}</span>
                    {ovrFogged && (
                      <span className="fog-range" title="估值误差">
                        ±{Math.round((p.ovr as FogValue).range)}
                      </span>
                    )}
                  </td>
                  {KEY_ABILITIES.map((ab) => {
                    const abMap = p.abilities as Abilities | Partial<Record<keyof Abilities, FogValue>>;
                    const val = abMap[ab.key];
                    const fogged = isFoggedAbility(val);
                    const num = abilityVal(val);
                    return (
                      <td key={ab.key} className="cell-skill">
                        <span
                          className={`skill-cell tier-${skillTier(num)}${fogged ? " is-fogged" : ""}`}
                          title={`${ab.label}：${num}${fogged ? ` ±${Math.round((val as FogValue).range)}` : ""}`}
                        >
                          {num}
                          {fogged && (
                            <span className="skill-fog">±{Math.round((val as FogValue).range)}</span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                  {onScout && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-scout"
                        onClick={() => onScout(p.id)}
                        title="球探探查"
                      >
                        🔍
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={3 + KEY_ABILITIES.length + (onScout ? 1 : 0)} className="empty-row">
                  没有匹配的球员
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="skills-pagination">
          <button
            type="button"
            className="page-btn"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            ◀ 上一页
          </button>
          <span className="page-info">
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            type="button"
            className="page-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页 ▶
          </button>
        </div>
      )}

      {side && (
        <div className="skills-side-hint">
          {side === "home" ? "主队" : "客队"}球员阵容
        </div>
      )}
    </div>
  );
}
