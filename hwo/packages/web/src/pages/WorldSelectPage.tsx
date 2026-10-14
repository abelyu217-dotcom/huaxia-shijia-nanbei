/**
 * WorldSelectPage — 世界大厅
 *
 * P1-3b：新用户注册后没有球队，需在此页面选择一个世界，
 * 再选择该世界中一支未被认领的 AI 球队，完成加入。
 *
 * 流程：
 *   1. 加载所有世界列表
 *   2. 用户点击一个世界 → 展开球队列表
 *   3. 用户选择一支空闲球队 → 调用 joinWorld
 *   4. 成功后刷新用户信息（teamId 不再为 null），由 App 切换到主界面
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createWorld, fetchWorlds, joinWorld } from "../api";
import type { WorldInfo } from "../types";
import { useAuth } from "../auth/AuthContext";

interface WorldSelectPageProps {
  /** 加入成功后回调，用于刷新用户信息 */
  onJoined: () => void;
}

export default function WorldSelectPage({ onJoined }: WorldSelectPageProps) {
  const { user } = useAuth();
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [newWorldName, setNewWorldName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchWorlds();
      setWorlds(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedWorld = useMemo(
    () => worlds.find((w) => w.id === selectedWorldId) ?? null,
    [worlds, selectedWorldId],
  );

  const availableTeams = useMemo(
    () => (selectedWorld ? selectedWorld.teams.filter((t) => t.userId === null) : []),
    [selectedWorld],
  );

  async function handleCreateWorld() {
    const name = newWorldName.trim() || `新世界-${Date.now().toString(36).slice(-4)}`;
    setCreating(true);
    setError(null);
    try {
      await createWorld(name, 42, "CN");
      setNewWorldName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(teamId: string) {
    if (!user || !selectedWorld) return;
    setJoining(teamId);
    setError(null);
    try {
      await joinWorld(selectedWorld.id, user.id, teamId);
      onJoined();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setJoining(null);
    }
  }

  if (loading) {
    return <div className="state"><span className="spinner" /> 加载世界列表…</div>;
  }

  return (
    <div className="page">
      <header className="page-head">
        <h2>世界大厅</h2>
        <p className="muted">
          选择一个世界加入，再认领一支球队开始你的经理生涯。
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {/* 创建新世界 */}
      <section className="create-world">
        <div className="create-world-row">
          <input
            type="text"
            className="input"
            placeholder="输入世界名称（可留空自动生成）"
            value={newWorldName}
            onChange={(e) => setNewWorldName(e.target.value)}
            disabled={creating}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreateWorld}
            disabled={creating}
          >
            {creating ? "创建中…" : "创建新世界"}
          </button>
        </div>
      </section>

      {/* 世界列表 */}
      <div className="world-grid">
        {worlds.map((w) => {
          const freeCount = w.teams.filter((t) => t.userId === null).length;
          const isSelected = w.id === selectedWorldId;
          return (
            <div
              key={w.id}
              className={`world-card ${isSelected ? "selected" : ""}`}
              onClick={() => setSelectedWorldId(w.id)}
            >
              <h3>{w.name}</h3>
              <div className="muted">
                {w.seasonName} · {w.region}
              </div>
              <div className="world-stats">
                <span>{w.teamCount} 支球队</span>
                <span className={freeCount > 0 ? "ok" : "warn"}>
                  {freeCount} 支可认领
                </span>
              </div>
            </div>
          );
        })}
        {worlds.length === 0 && (
          <div className="empty">暂无可用世界</div>
        )}
      </div>

      {/* 选中世界的球队列表 */}
      {selectedWorld && (
        <section className="team-select">
          <h3>
            {selectedWorld.name} — 选择球队
            <span className="muted">（{availableTeams.length} 支可认领）</span>
          </h3>
          <div className="team-grid">
            {selectedWorld.teams.map((t) => {
              const taken = t.userId !== null;
              return (
                <button
                  key={t.id}
                  className={`team-chip ${taken ? "taken" : ""}`}
                  disabled={taken || joining !== null}
                  onClick={() => handleJoin(t.id)}
                >
                  {t.name}
                  {taken && <span className="tag">已被认领</span>}
                  {!taken && joining === t.id && <span className="tag">加入中…</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
