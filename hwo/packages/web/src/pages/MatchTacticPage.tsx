/**
 * MatchTacticPage — 单场战术设定页
 *
 * 参考 Rim Attack 每场比赛独立战术设定流程：
 *   - 比赛信息面板：当前对阵 / 日期 / 主客场标识
 *   - 我方战术面板：查看并切换球队战术预设（进攻侧重 / 防守侧重）
 *   - 对手分析面板：解析对手进攻侧重 / 防守侧重 / 出手倾向
 *   - 反制策略面板：根据对手战术推荐反制预设与说明
 *   - 战术板预览：复用 TacticBoard 可视化站位
 *
 * 对接：
 *   GET  /api/season/schedule            → 定位比赛
 *   GET  /api/tactics/presets            → 可选战术列表
 *   GET  /api/tactics/team/:teamId       → 我方 / 对手战术
 *   PUT  /api/tactics/team/:teamId       → 切换战术预设
 *   GET  /api/tactics/counter/:presetId  → 反制建议
 */

import { useEffect, useState } from "react";
import {
  fetchCounterTactic,
  fetchSchedule,
  fetchTeamTactic,
  fetchTacticPresets,
  putTeamTactic,
} from "../api";
import type {
  CounterTacticResult,
  ScheduleDay,
  ScheduleMatch,
  TacticPreset,
  TeamTactic,
} from "../types";
import {
  DEFENSE_LABEL,
  OFFENSE_LABEL,
  TACTIC_CATEGORY_LABEL,
  TACTIC_CATEGORY_ORDER,
  TEMPO_LABEL,
} from "../lib";
import { useAuth } from "../auth/AuthContext";
import { TacticBoard } from "../components/TacticBoard";

interface Props {
  matchId?: string;
  teamId?: string;
}

// modSet 字段标签（本页局部使用，与 TacticEditor 保持一致措辞）
const OFFENSE_FOCUS_LABELS: Record<string, string> = {
  balanced: "均衡",
  drive: "突破",
  outside: "外线",
  inside: "内线",
  bully: "碾压",
  pnr: "挡拆",
};

const DEFENSE_FOCUS_LABELS: Record<string, string> = {
  interior: "内线",
  balanced: "均衡",
  perimeter: "外线",
};

const TENDENCY_LABELS: Record<string, string> = {
  drive: "突破",
  three: "三分",
  inside: "内线",
  postup: "背打",
  midrange: "中距离",
};

interface Notice {
  kind: "success" | "error";
  msg: string;
}

/** 在赛程中按 matchId 查找比赛及其所在日 */
function findScheduleMatch(
  schedule: ScheduleDay[],
  matchId: string,
): { day: number; match: ScheduleMatch } | null {
  for (const d of schedule) {
    const m = d.matches.find((mm) => mm.id === matchId);
    if (m) return { day: d.day, match: m };
  }
  return null;
}

export function MatchTacticPage({ matchId, teamId }: Props) {
  const { user } = useAuth();
  const myTeamId = teamId ?? user?.teamId ?? undefined;

  const [matchDay, setMatchDay] = useState<number | null>(null);
  const [match, setMatch] = useState<ScheduleMatch | null>(null);
  const [presets, setPresets] = useState<TacticPreset[]>([]);
  const [myTactic, setMyTactic] = useState<TeamTactic | null>(null);
  const [opponentTactic, setOpponentTactic] = useState<TeamTactic | null>(
    null,
  );
  const [counter, setCounter] = useState<CounterTacticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 成功提示自动消失
  useEffect(() => {
    if (!notice || notice.kind !== "success") return;
    const t = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // 主数据加载链：定位比赛 → 并行拉取预设/我方/对手战术 → 反制建议
  useEffect(() => {
    if (!matchId || !myTeamId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // 1. 定位比赛
        const schedule = await fetchSchedule();
        if (cancelled) return;
        const found = findScheduleMatch(schedule, matchId);
        if (!found) {
          if (!cancelled) {
            setError("未找到该比赛，请从赛程页重新选择");
            setLoading(false);
          }
          return;
        }
        setMatchDay(found.day);
        setMatch(found.match);

        // 2. 判定主客场与对手
        const isHome = found.match.homeTeamId === myTeamId;
        const opponentTeamId = isHome
          ? found.match.awayTeamId
          : found.match.homeTeamId;

        // 3. 并行拉取预设、我方战术、对手战术（独立请求，消除瀑布流）
        const [ps, mine, opp] = await Promise.all([
          fetchTacticPresets(),
          fetchTeamTactic(myTeamId),
          opponentTeamId
            ? fetchTeamTactic(opponentTeamId).catch(() => null)
            : Promise.resolve<TeamTactic | null>(null),
        ]);
        if (cancelled) return;
        setPresets(ps);
        setMyTactic(mine);
        setOpponentTactic(opp);

        // 4. 反制建议（依赖对手战术 presetId）
        if (opp) {
          const c = await fetchCounterTactic(opp.presetId).catch(() => null);
          if (cancelled) return;
          setCounter(c);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, myTeamId]);

  // 切换战术预设（即时保存）
  const handlePresetChange = async (presetId: string) => {
    if (!myTeamId || !myTactic) return;
    setSaving(true);
    setNotice(null);
    try {
      const updated = await putTeamTactic(myTeamId, { presetId });
      setMyTactic(updated);
      const preset = presets.find((p) => p.id === presetId);
      setNotice({
        kind: "success",
        msg: `战术已切换为「${preset?.name ?? updated.presetName}」`,
      });
    } catch (e: unknown) {
      setNotice({
        kind: "error",
        msg: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  // 无比赛：引导从赛程页选择
  if (!matchId) {
    return (
      <div className="match-tactic-page">
        <div className="page-head">
          <h2>单场战术设定</h2>
          <p className="muted">为当前比赛定制我方战术，并查看对手分析与反制策略</p>
        </div>
        <div className="empty-block">请从赛程页选择一场比赛</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="match-tactic-page">
        <div className="page-head">
          <h2>单场战术设定</h2>
        </div>
        <div className="state">
          <span className="spinner" /> 正在加载战术数据…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="match-tactic-page">
        <div className="page-head">
          <h2>单场战术设定</h2>
        </div>
        <div className="state error">加载失败：{error}</div>
      </div>
    );
  }

  // 主客场与对手在渲染期派生（非 state）
  const isHome = match?.homeTeamId === myTeamId;
  const mySideLabel = isHome ? "主场" : "客场";
  const opponentName = match
    ? isHome
      ? match.awayTeamName
      : match.homeTeamName
    : "—";

  // 对手出手倾向排序（高→低）
  const opponentTendencies = opponentTactic
    ? Object.entries(opponentTactic.modSet.tendencyMod)
        .map(([k, v]) => ({
          key: k,
          value: v,
          label: TENDENCY_LABELS[k] ?? k,
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const groupedPresets = TACTIC_CATEGORY_ORDER.map((cat) => ({
    cat,
    list: presets.filter((p) => p.category === cat),
  })).filter((g) => g.list.length > 0);

  return (
    <div className="match-tactic-page">
      <div className="page-head">
        <h2>单场战术设定</h2>
        <p className="muted">为当前比赛定制我方战术，并查看对手分析与反制策略</p>
      </div>

      {notice && (
        <div className={`match-notice ${notice.kind}`}>{notice.msg}</div>
      )}

      {/* 比赛信息面板 */}
      {match && (
        <section className="panel match-info-panel">
          <div className="panel-head">
            <h2>比赛信息</h2>
            <span className="hint">第 {matchDay ?? "—"} 日</span>
          </div>
          <div className="panel-body">
            <div className="match-vs">
              <div className={`match-side home${isHome ? " mine" : ""}`}>
                <span className="match-side-label">主场</span>
                <span className="match-side-name">{match.homeTeamName}</span>
                {match.homeTeamId === myTeamId && (
                  <span className="match-side-tag">我方</span>
                )}
              </div>
              <div className="match-vs-center">
                <span className="match-vs-vs">VS</span>
                <span className="match-vs-date">第 {matchDay ?? "—"} 日</span>
              </div>
              <div className={`match-side away${!isHome ? " mine" : ""}`}>
                <span className="match-side-label">客场</span>
                <span className="match-side-name">{match.awayTeamName}</span>
                {match.awayTeamId === myTeamId && (
                  <span className="match-side-tag">我方</span>
                )}
              </div>
            </div>
            <div className="match-side-hint">
              本场我方为 <strong>{mySideLabel}</strong>，对手：
              <strong>{opponentName}</strong>
            </div>
          </div>
        </section>
      )}

      <div className="match-tactic-grid">
        {/* 我方战术面板 */}
        <section className="panel my-tactic-panel">
          <div className="panel-head">
            <h2>我方战术</h2>
            <span className="hint">当前：{myTactic?.presetName ?? "—"}</span>
          </div>
          <div className="panel-body">
            {myTactic ? (
              <>
                <div className="kv">
                  <div>
                    <dt>战术预设</dt>
                    <dd>{myTactic.presetName}</dd>
                  </div>
                  <div>
                    <dt>进攻侧重</dt>
                    <dd>
                      {OFFENSE_FOCUS_LABELS[
                        myTactic.modSet.offenseFocus ?? "balanced"
                      ] ?? "均衡"}
                    </dd>
                  </div>
                  <div>
                    <dt>防守侧重</dt>
                    <dd>
                      {DEFENSE_FOCUS_LABELS[
                        myTactic.modSet.defenseFocus ?? "balanced"
                      ] ?? "均衡"}
                    </dd>
                  </div>
                </div>

                <h3
                  className="section-title"
                  style={{ marginTop: 16 }}
                >
                  切换战术预设
                </h3>
                <div className="tactic-preset-grid">
                  {groupedPresets.map(({ cat, list }) => (
                    <div key={cat} className="tactic-cat-group">
                      <h4 className="m4-subtitle">
                        {TACTIC_CATEGORY_LABEL[cat]}
                      </h4>
                      <div className="tactic-cat-list">
                        {list.map((t) => {
                          const active = myTactic.presetId === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              className={`tactic-preset-btn${
                                active ? " is-active" : ""
                              }`}
                              onClick={() => handlePresetChange(t.id)}
                              disabled={saving}
                            >
                              <span className="tpb-name">{t.name}</span>
                              <span className="tpb-desc">{t.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-hint">暂无我方战术数据</div>
            )}
          </div>
        </section>

        {/* 对手分析面板 */}
        <section className="panel opponent-analysis">
          <div className="panel-head">
            <h2>对手分析</h2>
            <span className="hint">{opponentName}</span>
          </div>
          <div className="panel-body">
            {opponentTactic ? (
              <>
                <div className="kv">
                  <div>
                    <dt>对手战术</dt>
                    <dd>{opponentTactic.presetName}</dd>
                  </div>
                  <div>
                    <dt>进攻侧重</dt>
                    <dd>
                      {OFFENSE_FOCUS_LABELS[
                        opponentTactic.modSet.offenseFocus ?? "balanced"
                      ] ?? "均衡"}
                    </dd>
                  </div>
                  <div>
                    <dt>防守侧重</dt>
                    <dd>
                      {DEFENSE_FOCUS_LABELS[
                        opponentTactic.modSet.defenseFocus ?? "balanced"
                      ] ?? "均衡"}
                    </dd>
                  </div>
                </div>

                <h3
                  className="section-title"
                  style={{ marginTop: 16 }}
                >
                  出手倾向
                </h3>
                <div className="opp-tendency-list">
                  {opponentTendencies.map((t, idx) => {
                    const pct = Math.round(((t.value + 1) / 2) * 100);
                    return (
                      <div
                        key={t.key}
                        className={`opp-tendency-row${
                          idx === 0 ? " is-top" : ""
                        }`}
                      >
                        <span className="opp-tendency-label">{t.label}</span>
                        <div className="opp-tendency-bar">
                          <div
                            className="opp-tendency-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="opp-tendency-value">
                          {t.value.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-hint">暂无对手战术数据</div>
            )}
          </div>
        </section>
      </div>

      {/* 反制策略面板 */}
      {counter && (
        <section className="panel counter-panel">
          <div className="panel-head">
            <h2>反制策略</h2>
            <span className="hint">
              针对 {opponentTactic?.presetName ?? "对手"} 的推荐战术
            </span>
          </div>
          <div className="panel-body">
            <div className="counter-card">
              <div className="counter-name">{counter.counter.name}</div>
              <div className="counter-desc">
                {TEMPO_LABEL[counter.counter.tempo]} ·{" "}
                {OFFENSE_LABEL[counter.counter.offenseTendency]}进攻 ·{" "}
                {DEFENSE_LABEL[counter.counter.defenseTendency]}防守
              </div>
              <div className="counter-reason">
                <strong>推荐理由：</strong>
                {counter.reason}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handlePresetChange(counter.counter.id)}
                disabled={
                  saving || myTactic?.presetId === counter.counter.id
                }
              >
                {myTactic?.presetId === counter.counter.id
                  ? "当前已使用"
                  : "切换到此战术"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 战术板预览 */}
      {myTactic && (
        <section className="panel tactic-board-panel">
          <div className="panel-head">
            <h2>战术板预览</h2>
            <span className="hint">根据当前战术参数预览站位</span>
          </div>
          <div className="panel-body tactic-board-wrap">
            <TacticBoard modSet={myTactic.modSet} width={360} />
          </div>
        </section>
      )}
    </div>
  );
}
