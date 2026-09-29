/**
 * LineupEditor — 阵容编辑器
 *
 * - 显示球队所有球员，可勾选 5 人作为首发
 * - 每个球员可设置目标出场时间（minutes）
 * - 总出场时间需在 200-240 分钟之间（5 人 × 48 分钟）
 * - 调用 PUT /api/teams/:id/lineup 持久化
 */

import { useEffect, useMemo, useState } from "react";
import { fetchLineup, putLineup } from "../api";
import type { LineupView } from "../types";
import { POSITION_LABEL } from "../lib";

interface Props {
  teamId: string;
  /** 当前用户是否拥有该球队（影响可编辑性） */
  editable: boolean;
  onSaved?: () => void;
}

const MAX_STARTERS = 5;
const MIN_TOTAL = 200;
const MAX_TOTAL = 240;

export function LineupEditor({ teamId, editable, onSaved }: Props) {
  const [data, setData] = useState<LineupView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // 本地编辑副本：starters + minutes
  const [starters, setStarters] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLineup(teamId)
      .then((view) => {
        if (cancelled) return;
        setData(view);
        setStarters([...view.starters]);
        setMinutes({ ...view.minutes });
        setDirty(false);
        setSaveMsg(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const totalMin = useMemo(
    () =>
      starters.reduce((sum, pid) => sum + (minutes[pid] ?? 0), 0),
    [starters, minutes],
  );

  function toggleStarter(pid: string) {
    if (!editable) return;
    setSaveMsg(null);
    setStarters((prev) => {
      if (prev.includes(pid)) {
        return prev.filter((id) => id !== pid);
      }
      if (prev.length >= MAX_STARTERS) {
        // 替换最后一个
        return [...prev.slice(0, MAX_STARTERS - 1), pid];
      }
      return [...prev, pid];
    });
    setDirty(true);
  }

  function setMin(pid: string, val: number) {
    if (!editable) return;
    setSaveMsg(null);
    const clamped = Math.max(0, Math.min(48, Math.round(val) || 0));
    setMinutes((prev) => ({ ...prev, [pid]: clamped }));
    setDirty(true);
  }

  async function handleSave() {
    if (!editable || !dirty) return;
    if (starters.length !== MAX_STARTERS) {
      setError(`首发必须为 ${MAX_STARTERS} 人，当前 ${starters.length} 人`);
      return;
    }
    if (totalMin < MIN_TOTAL || totalMin > MAX_TOTAL) {
      setError(`首发总出场时间需在 ${MIN_TOTAL}-${MAX_TOTAL} 分钟之间（当前 ${totalMin}）`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // 把首发之外的球员 minutes 设为 0
      const cleanMinutes: Record<string, number> = {};
      for (const pid of starters) cleanMinutes[pid] = minutes[pid] ?? 0;
      const updated = await putLineup(teamId, {
        starters,
        minutes: cleanMinutes,
      });
      setData(updated);
      setStarters([...updated.starters]);
      setMinutes({ ...updated.minutes });
      setDirty(false);
      setSaveMsg("阵容已保存");
      onSaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 正在加载阵容…
      </div>
    );
  }
  if (error && !data) {
    return <div className="state error">阵容加载失败：{error}</div>;
  }
  if (!data) return null;

  // 按 OVR/位置 排序：首发优先，然后按位置 + 名字
  const sortedPlayers = [...data.players].sort((a, b) => {
    const aStart = starters.includes(a.id) ? 0 : 1;
    const bStart = starters.includes(b.id) ? 0 : 1;
    if (aStart !== bStart) return aStart - bStart;
    return a.position.localeCompare(b.position) || a.name.localeCompare(b.name);
  });

  return (
    <div className="lineup-editor">
      <div className="lineup-head">
        <div className="lineup-summary">
          <span className="chip">首发 {starters.length}/{MAX_STARTERS}</span>
          <span
            className={`chip ${
              totalMin >= MIN_TOTAL && totalMin <= MAX_TOTAL ? "" : "warn"
            }`}
          >
            总出场 {totalMin} min
          </span>
          {dirty && <span className="chip tempo">未保存</span>}
        </div>
        {editable && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty || saving || starters.length !== MAX_STARTERS}
            onClick={handleSave}
          >
            {saving ? "保存中…" : "保存阵容"}
          </button>
        )}
      </div>

      {error && <div className="match-error">{error}</div>}
      {saveMsg && <div className="lineup-ok">{saveMsg}</div>}
      {!editable && (
        <div className="lineup-hint">你只能编辑自己球队的阵容。</div>
      )}

      <div className="lineup-grid">
        {sortedPlayers.map((p) => {
          const isStarter = starters.includes(p.id);
          return (
            <div
              key={p.id}
              className={`lineup-row${isStarter ? " is-starter" : ""}`}
            >
              <label className="lineup-check">
                <input
                  type="checkbox"
                  checked={isStarter}
                  disabled={!editable}
                  onChange={() => toggleStarter(p.id)}
                />
                <span className="lineup-pos">{POSITION_LABEL[p.position]}</span>
                <span className="lineup-name">{p.name}</span>
              </label>
              <div className="lineup-min">
                <input
                  type="number"
                  min={0}
                  max={48}
                  value={minutes[p.id] ?? 0}
                  disabled={!editable || !isStarter}
                  onChange={(e) => setMin(p.id, Number(e.target.value))}
                />
                <span className="lineup-min-unit">min</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
