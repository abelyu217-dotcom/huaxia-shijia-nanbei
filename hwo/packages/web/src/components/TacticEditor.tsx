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
  fetchLineup,
  fetchTacticUsage,
} from "../api";
import type {
  CounterTacticResult,
  DefenseEmphasis,
  LineupView,
  OffenseEmphasis,
  PlaybookAction,
  TacticPreset,
  TacticUsageStat,
  TeamTactic,
} from "../types";
import { TACTIC_CATEGORY_LABEL } from "../lib";
import { HelpTooltip } from "./HelpTooltip";
import { TacticBoard } from "./TacticBoard";

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

// M4: 选项标签
const PACE_LABELS: Record<string, string> = {
  faster: "提速", balanced: "均衡", slower: "降速",
};
const OFFENSE_FOCUS_LABELS: Record<string, string> = {
  balanced: "均衡", drive: "突破", outside: "外线", inside: "内线", bully: "碾压", pnr: "挡拆",
};
const BALL_DIST_LABELS: Record<string, string> = {
  natural: "自然", heliocentric: "核心持球", egalitarian: "均沾",
};
const FREEDOM_LABELS: Record<string, string> = {
  set_plays: "固定战术", freelance: "自由发挥",
};
const DEF_INTENSITY_LABELS: Record<string, string> = {
  aggressive: "激进", balanced: "均衡", conservative: "保守",
};
const DEF_FOCUS_LABELS: Record<string, string> = {
  interior: "内线", balanced: "均衡", perimeter: "外线",
};
const SCREEN_GUARDS_LABELS: Record<string, string> = {
  over: "绕过", under: "沉退", switch: "换防",
};
const SCREEN_BIGS_LABELS: Record<string, string> = {
  drop: "沉退", hedge: "延误", blitz: "包夹",
};
const OFFENSE_EMPHASIS_LABELS: Record<OffenseEmphasis, string> = {
  box_out: "卡位冲板", early_threes: "转换三分", get_to_rim: "冲击篮筐",
  midrange_drops: "中投战术", protect_ball: "保护球权",
};
const DEFENSE_EMPHASIS_LABELS: Record<DefenseEmphasis, string> = {
  no_fouls: "减少犯规", limit_fast_breaks: "防快攻", force_turnovers: "制造失误",
  protect_rim: "护框", limit_perimeter: "锁外线",
};
const ACTION_LABELS: Record<PlaybookAction, string> = {
  pnr_ball_handler: "挡拆持球", pnr_roll_man: "挡拆顺下", isolation: "单打",
  post_up: "背打", spot_up: "接球投", hand_off: "手递手",
  off_screen: "无球掩护", cut: "空切", transition: "快攻",
  putback: "补篮", second_chance: "二次进攻",
};

// M4: 末节策略标签
const ENDGAME_STRATEGY_LABELS: Record<string, { label: string; desc: string }> = {
  normal: { label: "正常战术", desc: "不做特殊调整" },
  milk_clock: { label: "压时间", desc: "领先时拖延节奏，消耗回合" },
  quick_three: { label: "抢投三分", desc: "落后时快速出手三分追分" },
  foul_strategy: { label: "砍鲨战术", desc: "落后时故意犯规停表" },
  isolate_star: { label: "球星单打", desc: "焦灼时交给核心球员终结" },
  double_team: { label: "包夹球星", desc: "防守端包夹对方核心球员" },
};
const ENDGAME_SITUATIONS: Array<{ key: "leading" | "trailing" | "close"; label: string; hint: string }> = [
  { key: "leading", label: "领先时", hint: "分差 > 5" },
  { key: "trailing", label: "落后时", hint: "分差 < -5" },
  { key: "close", label: "焦灼时", hint: "|分差| ≤ 5" },
];

const ALL_OFFENSE_EMPHASIS = Object.keys(OFFENSE_EMPHASIS_LABELS) as OffenseEmphasis[];
const ALL_DEFENSE_EMPHASIS = Object.keys(DEFENSE_EMPHASIS_LABELS) as DefenseEmphasis[];
const ALL_ACTIONS = Object.keys(ACTION_LABELS) as PlaybookAction[];

export function TacticEditor({ teamId }: Props) {
  const [presets, setPresets] = useState<TacticPreset[]>([]);
  const [tactic, setTactic] = useState<TeamTactic | null>(null);
  const [counter, setCounter] = useState<CounterTacticResult | null>(null);
  const [lineup, setLineup] = useState<LineupView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  // #5 基础/进阶模式切换
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const [usageStats, setUsageStats] = useState<TacticUsageStat[]>([]);

  // 格式化保存时间戳
  const formatSaved = (d: Date | null): string => {
    if (!d) return "尚未保存";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `最后保存 ${hh}:${mm}:${ss}`;
  };

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTacticPresets(),
      fetchTeamTactic(teamId),
      fetchLineup(teamId).catch(() => null),
      fetchTacticUsage().catch(() => []),
    ])
      .then(([ps, t, lv, us]) => {
        setPresets(ps);
        setTactic(t);
        if (lv) setLineup(lv);
        setUsageStats(us);
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
      setLastSaved(new Date());
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

  // M4: 通用 select 字段更新
  const handleSelectChange = (key: keyof TeamTactic["modSet"], value: string) => {
    if (!tactic) return;
    setTactic({
      ...tactic,
      modSet: { ...tactic.modSet, [key]: value },
    });
    setDirty(true);
  };

  // M4: emphasis / signature 多选切换（最多 N 个）
  const toggleArrayItem = <T extends string>(
    key: "offenseEmphasis" | "defenseEmphasis" | "signatureActions",
    item: T,
    max: number,
  ) => {
    if (!tactic) return;
    const current = (tactic.modSet[key] ?? []) as T[];
    let next: T[];
    if (current.includes(item)) {
      next = current.filter((x) => x !== item);
    } else {
      if (current.length >= max) return; // 超出上限忽略
      next = [...current, item];
    }
    setTactic({
      ...tactic,
      modSet: { ...tactic.modSet, [key]: next },
    });
    setDirty(true);
  };

  // M4: 末节策略更新
  const handleEndGameChange = (
    situation: "leading" | "trailing" | "close",
    value: string,
  ) => {
    if (!tactic) return;
    const current = tactic.modSet.endGameStrategies ?? {};
    setTactic({
      ...tactic,
      modSet: {
        ...tactic.modSet,
        endGameStrategies: { ...current, [situation]: value },
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
      setLastSaved(new Date());
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

      {/* 保存状态指示条 */}
      <div className="save-status-bar">
        {dirty ? (
          <span className="chip save-status-dirty">未保存变更</span>
        ) : (
          <span className="save-status-ok">{formatSaved(lastSaved)}</span>
        )}
      </div>

      {/* #5 基础/进阶模式切换 */}
      <div className="tactic-mode-toggle">
        <div className="tmt-group">
          <button
            type="button"
            className={`tmt-btn${mode === "basic" ? " is-active" : ""}`}
            onClick={() => setMode("basic")}
          >
            基础
          </button>
          <button
            type="button"
            className={`tmt-btn${mode === "advanced" ? " is-active" : ""}`}
            onClick={() => setMode("advanced")}
          >
            进阶
          </button>
        </div>
        <span className="tmt-hint">
          {mode === "basic"
            ? "快速选择战术风格与核心参数"
            : "完整控制所有战术微调项"}
        </span>
      </div>

      {/* 当前战术预设 */}
      <div className="panel">
        <div className="panel-head">
          <h2>战术预设 <HelpTooltip text="选择球队的整体战术风格。预设会影响进攻节奏、得分分布和防守策略。" /></h2>
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

      {/* M4: 球场可视化战术板（M6: 显示真实首发球员） */}
      <div className="panel">
        <div className="panel-head">
          <h2>战术板 <HelpTooltip text="根据当前战术参数可视化球员站位、出手热区和标志性动作。显示当前首发 5 人，外环颜色表示状态（绿/黄/橙/红）。" /></h2>
          <span className="hint">半场俯视图{lineup ? " · 真实首发" : ""}</span>
        </div>
        <div className="panel-body">
          <TacticBoard
            modSet={tactic.modSet}
            width={320}
            lineup={lineup ? { starters: lineup.starters, players: lineup.players } : null}
          />
        </div>
      </div>

      {/* M4: 战术熟练度 */}
      <div className="panel">
        <div className="panel-head">
          <h2>战术熟练度 <HelpTooltip text="各进攻动作的熟练度（0-100）。比赛中使用越多熟练度越高，熟练度不足会降低该动作的成功率。" /></h2>
          <span className="hint">通过比赛积累</span>
        </div>
        <div className="panel-body">
          <div className="familiarity-grid">
            {ALL_ACTIONS.map((action) => {
              const value = Math.round(tactic.modSet.familiarity?.[action] ?? 0);
              const color = value >= 80 ? "#22c55e" : value >= 50 ? "#eab308" : value > 0 ? "#f97316" : "#64748b";
              return (
                <div key={action} className="familiarity-item">
                  <div className="fam-header">
                    <span className="fam-label">{ACTION_LABELS[action]}</span>
                    <span className="fam-value" style={{ color }}>{value}</span>
                  </div>
                  <div className="fam-bar">
                    <div
                      className="fam-bar-fill"
                      style={{ width: `${value}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* M4 #8: 战术使用率统计 */}
      <div className="panel">
        <div className="panel-head">
          <h2>战术使用率统计 <HelpTooltip text="各战术预设在全联盟比赛中的使用场次、胜率和场均得失分。数据随比赛自动累计。" /></h2>
          <span className="hint">全联盟统计</span>
        </div>
        <div className="panel-body">
          {usageStats.length === 0 ? (
            <div className="empty-hint">暂无统计数据，进行比赛后将自动累计。</div>
          ) : (
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>战术</th>
                    <th>场次</th>
                    <th>胜</th>
                    <th>负</th>
                    <th>胜率</th>
                    <th>场均得分</th>
                    <th>场均失分</th>
                    <th>净胜分</th>
                  </tr>
                </thead>
                <tbody>
                  {usageStats.map((s) => {
                    const preset = presets.find((p) => p.id === s.presetId);
                    const isCurrent = tactic?.presetId === s.presetId;
                    const pdColor = s.pointDifferential > 0 ? "#22c55e" : s.pointDifferential < 0 ? "#ef4444" : "var(--muted)";
                    return (
                      <tr key={s.presetId} className={isCurrent ? "is-current" : ""}>
                        <td className="usage-name">
                          {preset?.name ?? s.presetId}
                          {isCurrent && <span className="usage-current-tag">当前</span>}
                        </td>
                        <td>{s.gamesPlayed}</td>
                        <td>{s.wins}</td>
                        <td>{s.losses}</td>
                        <td>{(s.winRate * 100).toFixed(1)}%</td>
                        <td>{s.avgPointsFor.toFixed(1)}</td>
                        <td>{s.avgPointsAgainst.toFixed(1)}</td>
                        <td style={{ color: pdColor, fontWeight: 600 }}>
                          {s.pointDifferential > 0 ? "+" : ""}{s.pointDifferential.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* #5 基础模式：核心参数 */}
      {mode === "basic" && (
        <div className="panel">
          <div className="panel-head">
            <h2>核心参数 <HelpTooltip text="快速设置战术的核心方向。进阶模式可调整更多细节。" /></h2>
            <span className="hint">调整后点击保存</span>
          </div>
          <div className="panel-body">
            <div className="m4-grid">
              <div className="m4-field">
                <label className="m4-label">节奏</label>
                <select
                  className="m4-select"
                  value={tactic.modSet.pace ?? "balanced"}
                  onChange={(e) => handleSelectChange("pace", e.target.value)}
                >
                  {Object.entries(PACE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="m4-field">
                <label className="m4-label">进攻侧重</label>
                <select
                  className="m4-select"
                  value={tactic.modSet.offenseFocus ?? "balanced"}
                  onChange={(e) => handleSelectChange("offenseFocus", e.target.value)}
                >
                  {Object.entries(OFFENSE_FOCUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="m4-field">
                <label className="m4-label">防守强度</label>
                <select
                  className="m4-select"
                  value={tactic.modSet.defenseIntensity ?? "balanced"}
                  onChange={(e) => handleSelectChange("defenseIntensity", e.target.value)}
                >
                  {Object.entries(DEF_INTENSITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="m4-field">
                <label className="m4-label">关键球执行者</label>
                <select
                  className="m4-select"
                  value={tactic.modSet.closerId ?? ""}
                  onChange={(e) => handleSelectChange("closerId", e.target.value)}
                >
                  <option value="">未指定（自动）</option>
                  {(lineup?.players ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.position}）
                    </option>
                  ))}
                </select>
              </div>
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
      )}

      {/* 参数微调 */}
      {mode === "advanced" && (
      <div className="panel">
        <div className="panel-head">
          <h2>参数微调 <HelpTooltip text="精细调整战术执行的各项倾向。滑块值越高，该行为发生的概率越大。" /></h2>
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
      )}

      {/* M4: 高级战术层 */}
      {mode === "advanced" && (
      <div className="panel">
        <div className="panel-head">
          <h2>高级战术 <HelpTooltip text="设置进攻重心、球权分配、防守强度等高级选项，进一步定制球队打法。" /></h2>
          <span className="hint">强调点 / 防挡拆 / 关键球执行者</span>
        </div>
        <div className="panel-body">
          {/* 进攻战术 */}
          <h3 className="section-title">进攻战术</h3>
          <div className="m4-grid">
            <div className="m4-field">
              <label className="m4-label">节奏</label>
              <select
                className="m4-select"
                value={tactic.modSet.pace ?? "balanced"}
                onChange={(e) => handleSelectChange("pace", e.target.value)}
              >
                {Object.entries(PACE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="m4-field">
              <label className="m4-label">进攻侧重</label>
              <select
                className="m4-select"
                value={tactic.modSet.offenseFocus ?? "balanced"}
                onChange={(e) => handleSelectChange("offenseFocus", e.target.value)}
              >
                {Object.entries(OFFENSE_FOCUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="m4-field">
              <label className="m4-label">球权分配</label>
              <select
                className="m4-select"
                value={tactic.modSet.ballDistribution ?? "natural"}
                onChange={(e) => handleSelectChange("ballDistribution", e.target.value)}
              >
                {Object.entries(BALL_DIST_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="m4-field">
              <label className="m4-label">进攻自由度</label>
              <select
                className="m4-select"
                value={tactic.modSet.offenseFreedom ?? "freelance"}
                onChange={(e) => handleSelectChange("offenseFreedom", e.target.value)}
              >
                {Object.entries(FREEDOM_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 进攻强调点（最多 2） */}
          <h4 className="m4-subtitle">进攻强调点（最多 2 个，带权衡）</h4>
          <div className="m4-chips">
            {ALL_OFFENSE_EMPHASIS.map((e) => {
              const active = (tactic.modSet.offenseEmphasis ?? []).includes(e);
              const disabled =
                !active && (tactic.modSet.offenseEmphasis ?? []).length >= 2;
              return (
                <button
                  key={e}
                  type="button"
                  className={`m4-chip${active ? " is-active" : ""}`}
                  onClick={() => toggleArrayItem("offenseEmphasis", e, 2)}
                  disabled={disabled}
                >
                  {OFFENSE_EMPHASIS_LABELS[e]}
                </button>
              );
            })}
          </div>

          {/* 防守战术 */}
          <h3 className="section-title" style={{ marginTop: 16 }}>防守战术</h3>
          <div className="m4-grid">
            <div className="m4-field">
              <label className="m4-label">防守强度</label>
              <select
                className="m4-select"
                value={tactic.modSet.defenseIntensity ?? "balanced"}
                onChange={(e) => handleSelectChange("defenseIntensity", e.target.value)}
              >
                {Object.entries(DEF_INTENSITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="m4-field">
              <label className="m4-label">防守侧重</label>
              <select
                className="m4-select"
                value={tactic.modSet.defenseFocus ?? "balanced"}
                onChange={(e) => handleSelectChange("defenseFocus", e.target.value)}
              >
                {Object.entries(DEF_FOCUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="m4-field">
              <label className="m4-label">后卫防挡拆</label>
              <select
                className="m4-select"
                value={tactic.modSet.screenDefGuards ?? "over"}
                onChange={(e) => handleSelectChange("screenDefGuards", e.target.value)}
              >
                {Object.entries(SCREEN_GUARDS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="m4-field">
              <label className="m4-label">大个子防挡拆</label>
              <select
                className="m4-select"
                value={tactic.modSet.screenDefBigs ?? "drop"}
                onChange={(e) => handleSelectChange("screenDefBigs", e.target.value)}
              >
                {Object.entries(SCREEN_BIGS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 防守强调点（最多 2） */}
          <h4 className="m4-subtitle">防守强调点（最多 2 个，带权衡）</h4>
          <div className="m4-chips">
            {ALL_DEFENSE_EMPHASIS.map((e) => {
              const active = (tactic.modSet.defenseEmphasis ?? []).includes(e);
              const disabled =
                !active && (tactic.modSet.defenseEmphasis ?? []).length >= 2;
              return (
                <button
                  key={e}
                  type="button"
                  className={`m4-chip${active ? " is-active" : ""}`}
                  onClick={() => toggleArrayItem("defenseEmphasis", e, 2)}
                  disabled={disabled}
                >
                  {DEFENSE_EMPHASIS_LABELS[e]}
                </button>
              );
            })}
          </div>

          {/* 教练标志性动作 */}
          <h3 className="section-title" style={{ marginTop: 16 }}>教练标志性动作</h3>
          <p className="m4-hint">选中的动作在进攻中触发权重提升（可多选）</p>
          <div className="m4-chips">
            {ALL_ACTIONS.map((a) => {
              const active = (tactic.modSet.signatureActions ?? []).includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  className={`m4-chip${active ? " is-active" : ""}`}
                  onClick={() => toggleArrayItem("signatureActions", a, 4)}
                >
                  {ACTION_LABELS[a]}
                </button>
              );
            })}
          </div>

          {/* 关键球执行者 */}
          <h3 className="section-title" style={{ marginTop: 16 }}>关键球执行者</h3>
          <p className="m4-hint">关键时刻（末节最后 2 分钟 + 分差 ≤5）优先交给该球员出手</p>
          <div className="m4-field">
            <select
              className="m4-select"
              value={tactic.modSet.closerId ?? ""}
              onChange={(e) => handleSelectChange("closerId", e.target.value)}
            >
              <option value="">未指定（按能力自动选择）</option>
              {(lineup?.players ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.position}）
                </option>
              ))}
            </select>
          </div>

          {/* M4: 末节策略 */}
          <h3 className="section-title" style={{ marginTop: 16 }}>末节策略</h3>
          <p className="m4-hint">关键时刻按比分情境自动触发对应策略（仅第4节/加时最后约2分钟生效）</p>
          <div className="endgame-grid">
            {ENDGAME_SITUATIONS.map((sit) => {
              const val = tactic.modSet.endGameStrategies?.[sit.key] ?? "normal";
              return (
                <div key={sit.key} className="endgame-slot">
                  <div className="endgame-slot-head">
                    <span className="endgame-sit-label">{sit.label}</span>
                    <span className="endgame-sit-hint">{sit.hint}</span>
                  </div>
                  <select
                    className="m4-select"
                    value={val}
                    onChange={(e) => handleEndGameChange(sit.key, e.target.value)}
                  >
                    {Object.entries(ENDGAME_STRATEGY_LABELS).map(([v, info]) => (
                      <option key={v} value={v}>
                        {info.label}
                      </option>
                    ))}
                  </select>
                  <div className="endgame-strategy-desc">
                    {ENDGAME_STRATEGY_LABELS[val]?.desc}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="param-actions" style={{ marginTop: 16 }}>
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
      )}

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
