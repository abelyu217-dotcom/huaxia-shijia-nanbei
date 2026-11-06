/**
 * WatchlistPage —— 青年观察名单
 *
 * 参考 Rim Attack 青年观察名单：
 *   - 从 localStorage（key: hwo_watchlist）读取已加入观察名单的球员 ID 列表
 *   - 调用 fetchFreeAgents() 在自由球员池中查找对应球员信息
 *     （观察名单的球员来自自由球员池 / 球探发现）
 *   - 每张卡片展示：姓名 / 位置 / 年龄 / 预估潜力 / 当前 OVR / 性格 / 球探报告
 *   - 支持移除（同步删除 localStorage 中的性格与球探报告条目）
 *
 * 纯 localStorage 驱动，不需要 props。
 */

import { useCallback, useEffect, useState } from "react";
import { fetchFreeAgents } from "../api";
import type { FreeAgent } from "../types";

const WATCHLIST_KEY = "hwo_watchlist";
const PERSONALITIES_KEY = "hwo_watchlist_personalities";
const REPORTS_KEY = "hwo_watchlist_reports";

interface WatchlistEntry {
  player: FreeAgent;
  personality: string;
  report: string;
}

/** 读取观察名单球员 ID 列表（容错解析）。 */
function readWatchlistIds(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** 读取 playerId → string 的映射（性格 / 球探报告）。 */
function readMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

/** 从映射中删除单个 key 并写回 localStorage。 */
function removeMapKey(key: string, playerId: string): void {
  try {
    const map = readMap(key);
    if (!(playerId in map)) return;
    delete map[playerId];
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ids = readWatchlistIds();
    if (ids.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      const freeAgents = await fetchFreeAgents();
      const personalities = readMap(PERSONALITIES_KEY);
      const reports = readMap(REPORTS_KEY);
      const byId = new Map(freeAgents.map((fa) => [fa.id, fa]));
      const next: WatchlistEntry[] = [];
      for (const id of ids) {
        const player = byId.get(id);
        if (!player) continue; // 已离开自由球员池（签约 / 退役）
        next.push({
          player,
          personality: personalities[id] ?? "",
          report: reports[id] ?? "",
        });
      }
      setEntries(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRemove(playerId: string) {
    const ids = readWatchlistIds().filter((id) => id !== playerId);
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(ids));
    } catch {
      // ignore
    }
    removeMapKey(PERSONALITIES_KEY, playerId);
    removeMapKey(REPORTS_KEY, playerId);
    setEntries((prev) => prev.filter((e) => e.player.id !== playerId));
  }

  return (
    <div className="page watchlist-page">
      <header className="page-head">
        <h2>青年观察名单</h2>
        <p className="muted">
          跟踪自由球员池中被标记的潜力新人，参考 Rim Attack 青年观察名单。
        </p>
      </header>

      {error && <div className="state error">{error}</div>}

      {loading ? (
        <div className="state">
          <span className="spinner" /> 加载观察名单…
        </div>
      ) : entries.length === 0 ? (
        <div className="state watchlist-empty">
          暂无观察名单，请前往球探页添加
        </div>
      ) : (
        <div className="watchlist-grid">
          {entries.map(({ player, personality, report }) => (
            <article className="watchlist-card" key={player.id}>
              <div className="watchlist-card-head">
                <div className="watchlist-card-id">
                  <span className="watchlist-card-pos">{player.position}</span>
                  <span className="watchlist-card-name" title={player.name}>
                    {player.name}
                  </span>
                </div>
                <span className="watchlist-card-age">{player.age} 岁</span>
              </div>

              <dl className="kv watchlist-kv">
                <div>
                  <dt>预估潜力</dt>
                  <dd>
                    {player.potential === null || player.potential === undefined
                      ? "未知"
                      : player.potential}
                  </dd>
                </div>
                <div>
                  <dt>当前 OVR</dt>
                  {/* FreeAgent 契约不含 ovr 字段，自由球员池暂未暴露 */}
                  <dd>—</dd>
                </div>
                <div>
                  <dt>性格</dt>
                  <dd>{personality || "—"}</dd>
                </div>
              </dl>

              <div className="watchlist-report">
                <div className="watchlist-report-label">球探报告</div>
                {report ? (
                  <p className="watchlist-report-text">{report}</p>
                ) : (
                  <p className="muted">暂无球探报告</p>
                )}
              </div>

              <div className="watchlist-card-foot">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => handleRemove(player.id)}
                >
                  移除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="row gap wrap">
          <button type="button" className="btn btn-ghost" onClick={load}>
            刷新
          </button>
        </div>
      )}
    </div>
  );
}
