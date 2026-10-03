/**
 * 球员技能表（参考 basketpulse.com/hk/Players/skills）
 *
 * - 顶部工具栏：姓名搜索 + 位置筛选
 * - 表格列：姓名 / 位置 / OVR / 各项能力值（数字 + 颜色编码单元格）
 * - 表头可点击排序，分页浏览
 * - 支持 The Fog 迷雾估值（带 ± 范围显示）
 */

import { useMemo, useState, type ReactNode } from "react";
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
  /** 导出文件名前缀（如球队名），默认 "球员名单" */
  exportName?: string;
  /** 在姓名列下方追加自定义内容（如改名/队长按钮、档案展开） */
  renderNameExtra?: (p: PlayerDetail) => ReactNode;
  /** 自定义每行末尾追加的单元格（如球探按钮、档案按钮） */
  renderRowActions?: (p: PlayerDetail) => ReactNode;
  /** 自定义行下方追加的整行内容（如档案展开行） */
  renderExtraRow?: (p: PlayerDetail) => ReactNode;
  /** 是否禁用分页（小名单可一页展示） */
  disablePagination?: boolean;
}

/** 触发浏览器下载 */
function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 字段值：值 + 是否带雾 */
interface ExportCell {
  val: number | string;
  fogRange?: number;
}

/** 把球员展开为一行导出数据（保留 ± 误差信息） */
function playerToRow(p: PlayerDetail): Record<string, ExportCell> {
  const ab = p.abilities as Record<string, number | FogValue>;
  const ovrFogged = typeof p.ovr === "object" && p.ovr !== null;
  const row: Record<string, ExportCell> = {
    姓名: { val: p.name },
    位置: { val: p.position },
    OVR: {
      val: ovrFogged ? (p.ovr as FogValue).est : (p.ovr as number),
      fogRange: ovrFogged ? Math.round((p.ovr as FogValue).range) : undefined,
    },
  };
  for (const ab2 of KEY_ABILITIES) {
    const v = ab[ab2.key as string];
    const fogged = isFoggedAbility(v);
    row[ab2.label] = {
      val: abilityVal(v),
      fogRange: fogged ? Math.round((v as FogValue).range) : undefined,
    };
  }
  if (p.age != null) row["年龄"] = { val: p.age };
  if (p.salary != null) row["年薪"] = { val: p.salary };
  if (p.isCaptain) row["队长"] = { val: "是" };
  if (p.isRookie) row["新秀"] = { val: "是" };
  return row;
}

/** 格式化单元格为 CSV 字符串 */
function csvCell(v: number | string, fog?: number): string {
  let s = String(v);
  if (fog != null) s += `±${fog}`;
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildTimestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function exportCsv(players: PlayerDetail[], namePrefix: string) {
  if (players.length === 0) return;
  const rows = players.map(playerToRow);
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvCell(r[h].val, r[h].fogRange)).join(","));
  }
  const bom = "\uFEFF";
  downloadFile(
    bom + lines.join("\n"),
    `${namePrefix}_${buildTimestamp()}.csv`,
    "text/csv;charset=utf-8",
  );
}

function exportJson(players: PlayerDetail[], namePrefix: string) {
  if (players.length === 0) return;
  const data = players.map(playerToRow).map((r) => {
    const out: Record<string, string> = {};
    for (const [k, c] of Object.entries(r)) {
      out[k] = c.fogRange != null ? `${c.val}±${c.fogRange}` : String(c.val);
    }
    return out;
  });
  downloadFile(
    JSON.stringify({ exportedAt: new Date().toISOString(), players: data }, null, 2),
    `${namePrefix}_${buildTimestamp()}.json`,
    "application/json;charset=utf-8",
  );
}

/** 按 basketpulse 风格为能力值分配颜色档位 */
function skillTier(val: number): "s" | "a" | "b" | "c" | "d" {
  if (val >= 90) return "s";
  if (val >= 80) return "a";
  if (val >= 70) return "b";
  if (val >= 60) return "c";
  return "d";
}

export function PlayerSkillsTable({
  players,
  side,
  onScout,
  exportName = "球员名单",
  renderNameExtra,
  renderRowActions,
  renderExtraRow,
  disablePagination = false,
}: Props) {
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
  const pageItems = disablePagination
    ? filtered
    : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
        {filtered.length > 0 && (
          <div className="export-group" role="group" aria-label="导出球员名单">
            <button
              type="button"
              className="btn btn-sm btn-export"
              onClick={() => exportCsv(filtered, exportName)}
              title="导出当前筛选结果为 CSV 文件"
            >
              ⬇ CSV
            </button>
            <button
              type="button"
              className="btn btn-sm btn-export"
              onClick={() => exportJson(filtered, exportName)}
              title="导出当前筛选结果为 JSON 文件"
            >
              ⬇ JSON
            </button>
          </div>
        )}
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
              {renderRowActions && <th>操作</th>}
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
                    {renderNameExtra?.(p)}
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
                  {renderRowActions && <td>{renderRowActions(p)}</td>}
                </tr>
              );
            })}
            {pageItems.flatMap((p) => {
              const extra = renderExtraRow?.(p);
              if (!extra) return [];
              const colCount = 3 + KEY_ABILITIES.length + (onScout ? 1 : 0) + (renderRowActions ? 1 : 0);
              return [
                <tr key={`${p.id}-extra`} className="skills-extra-row">
                  <td colSpan={colCount}>{extra}</td>
                </tr>,
              ];
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={3 + KEY_ABILITIES.length + (onScout ? 1 : 0) + (renderRowActions ? 1 : 0)} className="empty-row">
                  没有匹配的球员
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && !disablePagination && (
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
