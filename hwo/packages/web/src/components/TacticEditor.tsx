/**
 * TacticEditor —— 高级战术编辑器
 *
 * - 查看/切换球队当前战术预设
 * - 微调战术参数（节奏、倾向、防守等滑块）
 * - 查看反制策略推荐
 *
 * 对接：
 *   GET  /api/tactics/team/:teamId
 *   PUT  /api/tactics/team/:teamId
 *   GET  /api/tactics/counter/:presetId
 */

import { useEffect, useState } from "react";
import {
  fetchTacticPresets,
  fetchTeamTactic,
  putTeamTactic,
  fetchCounterTactic,
} from "../api";
import type {
  CounterTacticResult,
  TacticPreset,
  TeamTactic,
} from "../types";
import { TACTIC_CATEGORY_LABEL } from "../lib";

interface Props {
  teamId: string;
}

const TENDENCY_LABELS: Record<string, string> = {
  drive: "突破",
  three: "三分",
  inside: "内线",
  postup: "背打",
  midrange: "中距离",
};

const PARAM_LABELS: Record<string, { label: string; min: number; max: number; step: number }> = {
  stealChance: { label: "抢断倾向", min: 0, max: 1, step: 0.01 },
  helpDefChance: { label: "协防倾向", min: 0, max: 1, step: 0.01 },
  defenseContest: { label: "防守对抗", min: -1, max: 1, step: 0.01 },
  pickRollChance: { label: "挡拆频率", min: 0, max: 1, step: 0.01 },
  fastBreakChance: { label: "快攻倾向", min: 0, max: 1, step: 0.01 },
  possessionTimeDelta: { label: "回合时长变化", min: -10, max: 10, step: 1 },
};

export function TacticEditor({ teamId }: Props) {
  const [presets, setPresets] = useState<TacticPreset[]>([]);
  const [tactic, setTactic] = useState<TeamTactic | null>(null);
  const [counter, setCounter] = useState<CounterTacticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTacticPresets(), fetchTeamTactic(teamId)])
      .then(([ps, t]) => {
        setPresets(ps);
        setTactic(t);
        return fetchCounterTactic(t.presetId).catch(() => null);
      })
      .then((c) => {
        if (c) setCounter(c);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [teamId]);

  const handlePresetChange = async (presetId: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await putTeamTactic(teamId, { presetId });
      setTactic(updated);
      setDirty(false);
      const c = await fetchCounterTactic(presetId).catch(() => null);
      if (c) setCounter(c);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleModChange = (
    key: keyof typeof PARAM_LABELS,
    value: number,
  ) => {
    if (!tactic) return;
    setTactic({
      ...tactic,
      modSet: { ...tactic.modSet, [key]: value },
    });
    setDirty(true);
  };

  const handleTendencyChange = (key: string, value: number) => {
    if (!tactic) return;
    setTactic({
      ...tactic,
      modSet: {
        ...tactic.modSet,
        tendencyMod: { ...tactic.modSet.tendencyMod, [key]: value },
      },
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!tactic) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await putTeamTactic(teamId, {
        modSet: tactic.modSet as unknown as Record<string, unknown>,
      });
      setTactic(updated);
      setDirty(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    load();
    setDirty(false);
  };

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载战术编辑器…
      </div>
    );
  }

  if (!tactic) {
    return <div className="state error">无法加载战术数据</div>;
  }

  const grouped = presets.reduce<Record<string, TacticPreset[]>>(
    (acc, t) => {
      (acc[t.category] ??= []).push(t);
      return acc;
    },
    {},
  );

  return (
    <div className="tactic-editor">
      {error && <div className="state error">{error}</div>}

      {/* 当前战术预设 */}
      <div className="panel">
        <div className="panel-head">
          <h2>战术预设</h2>
          <span className="hint">当前：{tactic.presetName}</span>
        </div>
        <div className="panel-body">
          <div className="tactic-preset-grid">
            {Object.entries(grouped).map(([cat, list]) => (
              <div key={cat} className="tactic-cat-group">
                <h3 className="section-title">
                  {TACTIC_CATEGORY_LABEL[cat as keyof typeof TACTIC_CATEGORY_LABEL] ?? cat}
                </h3>
                <div className="tactic-cat-list">
                  {list.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tactic-preset-btn${
                        tactic.presetId === t.id ? " is-active" : ""
                      }`}
                      onClick={() => handlePresetChange(t.id)}
                      disabled={saving}
                    >
                      <span className="tpb-name">{t.name}</span>
                      <span className="tpb-desc">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 参数微调 */}
      <div className="panel">
        <div className="panel-head">
          <h2>参数微调</h2>
          <span className="hint">调整后点击保存</span>
        </div>
        <div className="panel-body">
          <div className="param-sliders">
            {Object.entries(PARAM_LABELS).map(([key, cfg]) => (
              <div key={key} className="param-row">
                <label className="param-label">{cfg.label}</label>
                <input
                  type="range"
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  value={tactic.modSet[key as keyof typeof tactic.modSet] as number}
                  onChange={(e) =>
                    handleModChange(
                      key as keyof typeof PARAM_LABELS,
                      Number(e.target.value),
                    )
                  }
                  className="param-slider"
                />
                <span className="param-value">
                  {(
                    tactic.modSet[key as keyof typeof tactic.modSet] as number
                  ).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* 进攻倾向 */}
          <h3 className="section-title" style={{ marginTop: 16 }}>
            进攻倾向
          </h3>
          <div className="param-sliders">
            {Object.entries(tactic.modSet.tendencyMod).map(([key, val]) => (
              <div key={key} className="param-row">
                <label className="param-label">
                  {TENDENCY_LABELS[key] ?? key}
                </label>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={val}
                  onChange={(e) =>
                    handleTendencyChange(key, Number(e.target.value))
                  }
                  className="param-slider"
                />
                <span className="param-value">{val.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="param-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? "保存中…" : "保存修改"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleReset}
              disabled={!dirty}
            >
              重置
            </button>
          </div>
        </div>
      </div>

      {/* 反制策略 */}
      {counter && (
        <div className="panel">
          <div className="panel-head">
            <h2>反制策略推荐</h2>
            <span className="hint">针对 {tactic.presetName} 的克制战术</span>
          </div>
          <div className="panel-body">
            <div className="counter-card">
              <div className="counter-name">{counter.counter.name}</div>
              <div className="counter-desc">{counter.counter.desc}</div>
              <div className="counter-reason">
                <strong>推荐理由：</strong>
                {counter.reason}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handlePresetChange(counter.counter.id)}
                disabled={saving}
              >
                切换到此战术
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
