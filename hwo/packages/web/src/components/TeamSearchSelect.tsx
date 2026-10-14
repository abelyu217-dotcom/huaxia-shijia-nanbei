/**
 * TeamSearchSelect —— 球队模糊搜索选择器（v0.6 §批次6）
 *
 * 用途：
 *   - 在交易/球探/市场页中提供球队快速搜索 + 选择
 *
 * 功能：
 *   - 关键字模糊搜索（名称/城市/ID 包含）
 *   - 可选 leagueId / worldId 过滤
 *   - 防抖 300ms
 *   - 选中后通过 onSelect 回调返回 teamId 与 teamName
 *
 * 使用：
 *   <TeamSearchSelect
 *     worldId="xxx"
 *     placeholder="搜索对手球队…"
 *     onSelect={(team) => onSelect(team.id, team.name)}
 *   />
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { searchTeams } from "../api";
import type { TeamSearchResult } from "../types";

interface Props {
  /** 搜索结果过滤：联赛 ID */
  leagueId?: string;
  /** 搜索结果过滤：世界 ID */
  worldId?: string;
  /** 输入框 placeholder */
  placeholder?: string;
  /** 选中球队回调 */
  onSelect: (team: TeamSearchResult) => void;
  /** 限制返回数量，默认 30 */
  limit?: number;
}

export function TeamSearchSelect({
  leagueId,
  worldId,
  placeholder = "搜索球队（名称 / 城市 / ID）…",
  onSelect,
  limit = 30,
}: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TeamSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback(
    async (keyword: string) => {
      setLoading(true);
      try {
        const data = await searchTeams({
          q: keyword || undefined,
          leagueId,
          worldId,
          limit,
        });
        setResults(data);
        setHighlight(data.length > 0 ? 0 : -1);
        setOpen(true);
      } catch {
        setResults([]);
        setHighlight(-1);
      } finally {
        setLoading(false);
      }
    },
    [leagueId, worldId, limit],
  );

  // 防抖搜索
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void runSearch(q);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, runSearch]);

  // 失焦关闭下拉
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && highlight < results.length) {
        const pick = results[highlight]!;
        onSelect(pick);
        setOpen(false);
        setQ("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="team-search" ref={containerRef}>
      <input
        type="text"
        className="input team-search-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && <span className="spinner-sm team-search-spinner" />}
      {open && results.length > 0 && (
        <ul className="team-search-dropdown">
          {results.map((r, i) => (
            <li
              key={r.id}
              className={`team-search-item${i === highlight ? " is-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(r);
                setOpen(false);
                setQ("");
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <div className="team-search-item-main">
                <span className="team-search-item-name">{r.name}</span>
                {r.city && <span className="team-search-item-city muted">{r.city}</span>}
              </div>
              <div className="team-search-item-meta muted small">
                <span>{r.id}</span>
                {r.worldName && <span> · {r.worldName}</span>}
                <span> · {r.playerCount} 人</span>
                {r.captainName && <span> · 队长 {r.captainName}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && results.length === 0 && q.trim().length > 0 && (
        <div className="team-search-empty muted">无匹配球队</div>
      )}
    </div>
  );
}
