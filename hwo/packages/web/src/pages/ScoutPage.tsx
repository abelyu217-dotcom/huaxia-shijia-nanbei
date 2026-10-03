/**
 * ScoutPage —— 球探面板
 *
 * 参考 Rim Attack / BasketPulse 球探系统：
 *   - 球探面板：等级、每周探索次数、剩余探索次数（前端 mock，1-5 级）
 *   - 新秀发现列表：调用 fetchFreeAgents() 模拟"球探发现的新秀"
 *   - 本周探索按钮：随机抽取 3 名"新发现"球员展示（前端模拟）
 *
 * 性格与球探报告均为前端 mock，依据位置 + 潜力模板生成。
 * "加入观察名单"按钮将球员 ID 存入 localStorage（key: hwo_watchlist）。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchFreeAgents,
  fetchWorlds,
  fetchScoutBudget,
  fetchScoutReports,
  postSignFreeAgent,
} from "../api";
import { ovrVal } from "../lib";
import type { FreeAgent, ScoutReport } from "../types";
import { useAuth } from "../auth/AuthContext";

interface Props {
  teamId?: string;
}

interface PersonalityDef {
  key: string;
  label: string;
}

/** 性格池（前端 mock，随机分配） */
const PERSONALITIES: readonly PersonalityDef[] = [
  { key: "diligent", label: "勤恳" },
  { key: "talented", label: "天赋型" },
  { key: "leader", label: "领袖" },
  { key: "toxic", label: "更衣室毒瘤" },
  { key: "steady", label: "稳定型" },
];

const POSITION_CN: Record<string, string> = {
  PG: "控卫", SG: "分卫", SF: "小前", PF: "大前", C: "中锋",
};

/** 球探等级（前端 mock，1-5 级） */
const SCOUT_LEVEL = 3;
const MAX_SCOUT_LEVEL = 5;

/** 各等级每周探索次数（前端 mock） */
const WEEKLY_EXPLORE_BY_LEVEL: Record<number, number> = {
  1: 2, 2: 3, 3: 4, 4: 5, 5: 7,
};

const WATCHLIST_KEY = "hwo_watchlist";
const SCOUT_STATE_KEY = "hwo_scout_state";
const DISCOVER_COUNT = 3;

interface ScoutState {
  /** 当前自然周起始 ISO 日期，用于每周重置剩余次数 */
  weekStart: string;
  remaining: number;
}

interface Prospect {
  id: string;
  name: string;
  position: string;
  age: number;
  /** 原始潜力值；为 null 时前端以"未知"展示 */
  potential: number | null;
  /** 球探估计潜力（potential 为 null 时用确定性伪随机模拟） */
  potentialEstimate: number;
  /** 当前 OVR（前端 mock，FreeAgent 无此字段） */
  ovr: number;
  salary: number;
  personality: PersonalityDef;
  report: string;
}

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/** 当前自然周起始（周一）ISO 日期 */
function currentWeekStart(d = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function loadScoutState(level: number): ScoutState {
  const weekly = WEEKLY_EXPLORE_BY_LEVEL[level] ?? 3;
  const raw = readLS(SCOUT_STATE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ScoutState;
      if (parsed.weekStart === currentWeekStart()) {
        return { ...parsed, remaining: Math.min(parsed.remaining, weekly) };
      }
    } catch {
      // ignore
    }
  }
  return { weekStart: currentWeekStart(), remaining: weekly };
}

function saveScoutState(s: ScoutState): void {
  writeLS(SCOUT_STATE_KEY, JSON.stringify(s));
}

function loadWatchlist(): Set<string> {
  const raw = readLS(WATCHLIST_KEY);
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return new Set(arr.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    // ignore
  }
  // 兼容旧格式：逗号分隔
  return new Set(
    raw.split(",").map((s) => s.trim()).filter(Boolean),
  );
}

function saveWatchlist(set: Set<string>): void {
  writeLS(WATCHLIST_KEY, JSON.stringify([...set]));
}

/** 简易 FNV-1a 哈希，用于稳定 mock 字段（同 ID 永远得到相同性格/报告） */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = ((h ^ s.charCodeAt(i)) * 16777619) >>> 0;
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function randInt(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1));
}

/** 球探评级：基于潜力值 */
function scoutGrade(potential: number): { grade: string; color: string } {
  if (potential >= 90) return { grade: "S+ 未来超巨", color: "#ff4757" };
  if (potential >= 85) return { grade: "S 全明星潜质", color: "#ff6b81" };
  if (potential >= 80) return { grade: "A 优质首发", color: "#ffa502" };
  if (potential >= 75) return { grade: "B 可靠轮换", color: "#7bed9f" };
  if (potential >= 70) return { grade: "C 角色球员", color: "#70a1ff" };
  return { grade: "D 边缘球员", color: "#a4b0be" };
}

/** 根据位置 + 潜力生成球探报告模板 */
function buildReport(position: string, potential: number): string {
  const pos = POSITION_CN[position] ?? position;
  const tier = scoutGrade(potential).grade.split(" ")[0];
  const base: Record<string, string> = {
    PG: "组织视野不错，突破分球节奏感强；需要加强三分稳定性。",
    SG: "得分手段多样，中距离手感柔和；防守横移需提升。",
    SF: "侧翼切换能力好，无球跑动积极；对抗强度待加强。",
    PF: "篮下终结能力强，拼抢积极；策应能力可培养。",
    C: "护框与篮板嗅觉不错，挡拆顺下效率高；罚球手感待打磨。",
  };
  const note = base[position] ?? "技术底子扎实，轮换定位清晰。";
  if (tier === "S+" || tier === "S") {
    return `${pos}位高潜力新秀。${note}上限可观，建议重点培养。`;
  }
  if (tier === "A") {
    return `${pos}位优质即战力。${note}未来有望冲击首发。`;
  }
  if (tier === "B") {
    return `${pos}位轮换级球员。${note}可发展为可靠角色球员。`;
  }
  return `${pos}位边缘球员。${note}需要时间打磨，态度端正。`;
}

/** 将 FreeAgent 转为带 mock 字段的 Prospect（基于 ID 哈希稳定） */
function toProspect(fa: FreeAgent): Prospect {
  const seed = hashStr(fa.id);
  const potentialEstimate = fa.potential ?? randInt(seed, 55, 95);
  // mock OVR：比潜力低 5~15
  const ovr = Math.max(40, potentialEstimate - 5 - (seed % 11));
  const personality = pick(PERSONALITIES, seed >> 3);
  return {
    id: fa.id,
    name: fa.name,
    position: fa.position,
    age: fa.age,
    potential: fa.potential,
    potentialEstimate,
    ovr,
    salary: fa.salary,
    personality,
    report: buildReport(fa.position, potentialEstimate),
  };
}

/** 从自由球员池随机抽取 n 名"新发现"球员（前端模拟） */
function sampleDiscover(pool: FreeAgent[], n: number): FreeAgent[] {
  if (pool.length <= n) return [...pool];
  const result: FreeAgent[] = [];
  const used = new Set<number>();
  while (result.length < n) {
    const idx = Math.floor(Math.random() * pool.length);
    if (used.has(idx)) continue;
    used.add(idx);
    result.push(pool[idx]);
  }
  return result;
}

export function ScoutPage({ teamId }: Props) {
  const { user } = useAuth();
  const myTeamId = teamId ?? user?.teamId ?? undefined;

  const [worldId, setWorldId] = useState<string | undefined>(undefined);
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoutState, setScoutState] = useState<ScoutState>(() =>
    loadScoutState(SCOUT_LEVEL),
  );
  const [discovered, setDiscovered] = useState<FreeAgent[]>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(() =>
    loadWatchlist(),
  );

  // Tab 切换：球探 / 自由市场
  const [tab, setTab] = useState<"scout" | "market">("scout");
  // 自由市场签约状态
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signYears, setSignYears] = useState(2);
  const [signSalary, setSignSalary] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signedIds, setSignedIds] = useState<Set<string>>(new Set());

  // 真实后端：球探预算与已探查报告
  const [budget, setBudget] = useState<{ remaining: number; total: number; used: number } | null>(null);
  const [reports, setReports] = useState<ScoutReport[]>([]);

  // 查找我所在世界（用于 fetchFreeAgents 限定世界范围）
  useEffect(() => {
    if (!myTeamId) return;
    let cancelled = false;
    fetchWorlds()
      .then((worlds) => {
        if (cancelled) return;
        const w = worlds.find((world) =>
          world.teams.some((t) => t.id === myTeamId),
        );
        setWorldId(w?.id);
      })
      .catch(() => {
        // 忽略：fallback 不传 worldId
      });
    return () => {
      cancelled = true;
    };
  }, [myTeamId]);

  // 加载自由球员列表
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFreeAgents(worldId)
      .then((list) => {
        if (cancelled) return;
        setFreeAgents(list);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  // 加载真实球探预算与已探查报告（需登录且有球队）
  useEffect(() => {
    if (!myTeamId) return;
    let cancelled = false;
    Promise.all([fetchScoutBudget(), fetchScoutReports()])
      .then(([b, r]) => {
        if (cancelled) return;
        setBudget(b);
        setReports(r);
      })
      .catch(() => {
        // 预算/报告加载失败不阻塞页面展示
      });
    return () => {
      cancelled = true;
    };
  }, [myTeamId]);

  // 持久化 scout 状态
  useEffect(() => {
    saveScoutState(scoutState);
  }, [scoutState]);

  // 持久化 watchlist
  useEffect(() => {
    saveWatchlist(watchlist);
  }, [watchlist]);

  const handleExplore = useCallback(() => {
    if (scoutState.remaining <= 0 || freeAgents.length === 0) return;
    setDiscovered(sampleDiscover(freeAgents, DISCOVER_COUNT));
    setScoutState((s) => ({
      ...s,
      remaining: Math.max(0, s.remaining - 1),
    }));
  }, [scoutState.remaining, freeAgents]);

  const handleWatch = useCallback((playerId: string) => {
    setWatchlist((prev) => {
      if (prev.has(playerId)) return prev;
      const next = new Set(prev);
      next.add(playerId);
      return next;
    });
  }, []);

  /** 打开签约表单：以球员要求薪资为默认值 */
  const openSign = useCallback((p: Prospect) => {
    setSigningId(p.id);
    setSignYears(2);
    setSignSalary(Math.max(100, p.salary || 1000));
    setSignError(null);
  }, []);

  /** 提交签约自由球员 */
  const handleSign = useCallback(async () => {
    if (!signingId || !myTeamId) return;
    setSigning(true);
    setSignError(null);
    try {
      await postSignFreeAgent({
        playerId: signingId,
        teamId: myTeamId,
        yearsTotal: signYears,
        salaryPerYear: signSalary,
      });
      setSignedIds((prev) => {
        const next = new Set(prev);
        next.add(signingId);
        return next;
      });
      setSigningId(null);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  }, [signingId, myTeamId, signYears, signSalary]);

  const allProspects = useMemo(
    () => freeAgents.map(toProspect),
    [freeAgents],
  );
  const discoveredProspects = useMemo(
    () => discovered.map(toProspect),
    [discovered],
  );
  const weeklyCount = WEEKLY_EXPLORE_BY_LEVEL[SCOUT_LEVEL] ?? 0;

  return (
    <div className="page scout-page">
      <header className="page-head">
        <h2>{tab === "scout" ? "球探面板" : "自由市场"}</h2>
        <p className="muted">
          {tab === "scout"
            ? "派遣球探发掘新秀。等级越高每周可探索次数越多，潜力评估更精准。"
            : "浏览自由球员并提交报价签约。参考 BasketPulse 自由市场：筛选条件 + 报价签约。"}
        </p>
      </header>

      {/* Tab 切换 */}
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "scout"}
          className={`tab${tab === "scout" ? " is-active" : ""}`}
          onClick={() => setTab("scout")}
        >
          球探
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "market"}
          className={`tab${tab === "market" ? " is-active" : ""}`}
          onClick={() => setTab("market")}
        >
          自由市场
        </button>
      </div>

      {error && <div className="state error">{error}</div>}

      {tab === "scout" && (
        <>
      {/* 球探面板 */}
      <section className="card scout-panel">
        <div className="scout-metrics">
          <div className="scout-metric">
            <span className="scout-metric-label">球探等级</span>
            <span className="scout-metric-value">
              {SCOUT_LEVEL}
              <span className="scout-metric-sub"> / {MAX_SCOUT_LEVEL}</span>
            </span>
          </div>
          <div className="scout-metric">
            <span className="scout-metric-label">每周探索次数</span>
            <span className="scout-metric-value">{weeklyCount}</span>
          </div>
          <div className="scout-metric">
            <span className="scout-metric-label">剩余探索次数</span>
            <span className="scout-metric-value scout-remaining">
              {scoutState.remaining}
            </span>
          </div>
          {budget && (
            <div className="scout-metric">
              <span className="scout-metric-label">赛季球探预算</span>
              <span className="scout-metric-value">
                {budget.remaining}
                <span className="scout-metric-sub"> / {budget.total}</span>
              </span>
            </div>
          )}
        </div>
        <div className="row gap wrap scout-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={scoutState.remaining <= 0 || freeAgents.length === 0}
            onClick={handleExplore}
          >
            本周探索
          </button>
          <span className="muted">
            {freeAgents.length > 0
              ? `自由球员池共 ${freeAgents.length} 人`
              : "暂无可探索球员"}
          </span>
        </div>
      </section>

      {/* 本周新发现 */}
      {discoveredProspects.length > 0 && (
        <section className="card">
          <h3>本周新发现（{discoveredProspects.length}）</h3>
          <div className="scout-grid">
            {discoveredProspects.map((p) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                inWatchlist={watchlist.has(p.id)}
                onWatch={() => handleWatch(p.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 已探查球员（真实后端球探报告） */}
      {reports.length > 0 && (
        <section className="card">
          <h3>已探查球员（{reports.length}）</h3>
          <p className="muted">
            以下球员已被本队球探探查过，迷雾范围已收窄。可在球队页继续探查以进一步缩小误差。
          </p>
          <div className="scout-reports-list">
            {reports.map((r) => (
              <div className="scout-report-row" key={r.playerId}>
                <span className="scout-report-id">{r.playerId.slice(0, 8)}</span>
                <span className="muted">探查 {r.scoutCount} 次</span>
                <span className="muted">
                  {r.traitHints.length > 0
                    ? `特质线索：${r.traitHints.join("、")}`
                    : "暂无特质线索"}
                </span>
                <span className="muted">
                  {new Date(r.lastScoutedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 新秀发现列表 */}
      <section className="card">
        <h3>新秀发现列表（{allProspects.length}）</h3>
        <p className="muted">
          以下为球探系统当前关注的自由球员。潜力为"未知"时以球探估计值辅助评估。
        </p>
        {loading ? (
          <div className="state"><span className="spinner" /> 加载新秀列表…</div>
        ) : allProspects.length === 0 ? (
          <div className="muted">暂无可发现的自由球员。</div>
        ) : (
          <div className="scout-grid">
            {allProspects.map((p) => (
              <ProspectCard
                key={p.id}
                prospect={p}
                inWatchlist={watchlist.has(p.id)}
                onWatch={() => handleWatch(p.id)}
              />
            ))}
          </div>
        )}
      </section>
        </>
      )}

      {tab === "market" && (
        <FreeMarketView
          prospects={allProspects}
          loading={loading}
          signedIds={signedIds}
          signingId={signingId}
          signYears={signYears}
          signSalary={signSalary}
          signError={signError}
          signing={signing}
          onOpenSign={openSign}
          onCancelSign={() => setSigningId(null)}
          onYearsChange={setSignYears}
          onSalaryChange={setSignSalary}
          onSubmit={handleSign}
        />
      )}
    </div>
  );
}

interface ProspectCardProps {
  prospect: Prospect;
  inWatchlist: boolean;
  onWatch: () => void;
}

function ProspectCard({ prospect, inWatchlist, onWatch }: ProspectCardProps) {
  const { grade, color } = scoutGrade(prospect.potentialEstimate);
  const pos = POSITION_CN[prospect.position] ?? prospect.position;
  const pct = Math.min(100, (prospect.potentialEstimate / 99) * 100);
  const showUnknownPotential = prospect.potential === null;

  return (
    <div className="prospect-card">
      <div className="scout-head">
        <strong>{prospect.name}</strong>
        <span className="scout-position">{pos}</span>
      </div>
      <div className="scout-grade" style={{ color }}>{grade}</div>
      <div className="prospect-meta">
        <span className="muted">年龄 {prospect.age}</span>
        {prospect.salary > 0 && (
          <span className="muted">
            薪资 ${prospect.salary.toLocaleString()}
          </span>
        )}
      </div>
      <div className="scout-stats">
        <div className="stat-row">
          <span>预估潜力</span>
          <span className="stat-val">
            {showUnknownPotential ? "未知" : prospect.potential}
          </span>
        </div>
        <div className="stat-row">
          <span>当前 OVR</span>
          <span className="stat-val">{ovrVal(prospect.ovr)}</span>
        </div>
      </div>
      <div className="potential-bar">
        <div
          className="potential-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="prospect-personality">
        <span
          className={`personality-badge personality-${prospect.personality.key}`}
        >
          {prospect.personality.label}
        </span>
      </div>
      <p className="scout-note muted">{prospect.report}</p>
      <button
        type="button"
        className="btn btn-sm"
        disabled={inWatchlist}
        onClick={onWatch}
      >
        {inWatchlist ? "已加入观察名单" : "加入观察名单"}
      </button>
    </div>
  );
}

interface FreeMarketViewProps {
  prospects: Prospect[];
  loading: boolean;
  signedIds: Set<string>;
  signingId: string | null;
  signYears: number;
  signSalary: number;
  signError: string | null;
  signing: boolean;
  onOpenSign: (p: Prospect) => void;
  onCancelSign: () => void;
  onYearsChange: (n: number) => void;
  onSalaryChange: (n: number) => void;
  onSubmit: () => void;
}

function FreeMarketView({
  prospects,
  loading,
  signedIds,
  signingId,
  signYears,
  signSalary,
  signError,
  signing,
  onOpenSign,
  onCancelSign,
  onYearsChange,
  onSalaryChange,
  onSubmit,
}: FreeMarketViewProps) {
  const available = prospects.filter((p) => !signedIds.has(p.id));

  return (
    <section className="card">
      <h3>自由球员（{available.length}）</h3>
      <p className="muted">
        以下为当前可签约的自由球员。点击「报价」提交合同，签约成功后该球员将加入你的球队。
      </p>
      {loading ? (
        <div className="state"><span className="spinner" /> 加载自由球员…</div>
      ) : available.length === 0 ? (
        <div className="muted">暂无可签约的自由球员。</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table market-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>位置</th>
                <th>年龄</th>
                <th>OVR</th>
                <th>潜力</th>
                <th>薪资要求</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {available.map((p) => {
                const pos = POSITION_CN[p.position] ?? p.position;
                const isSigning = signingId === p.id;
                const { grade, color } = scoutGrade(p.potentialEstimate);
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{grade}</div>
                    </td>
                    <td>{pos}</td>
                    <td>{p.age}</td>
                    <td>{ovrVal(p.ovr)}</td>
                    <td style={{ color }}>
                      {p.potential === null ? `${p.potentialEstimate}（估）` : p.potential}
                    </td>
                    <td>${p.salary.toLocaleString()}</td>
                    <td>
                      {isSigning ? (
                        <div className="sign-form">
                          {signError && (
                            <div className="state error" style={{ marginBottom: 8 }}>
                              {signError}
                            </div>
                          )}
                          <div className="row gap" style={{ marginBottom: 8 }}>
                            <label className="muted">
                              年限
                              <select
                                value={signYears}
                                onChange={(e) => onYearsChange(Number(e.target.value))}
                                disabled={signing}
                              >
                                {[1, 2, 3, 4, 5].map((y) => (
                                  <option key={y} value={y}>{y} 年</option>
                                ))}
                              </select>
                            </label>
                            <label className="muted">
                              年薪
                              <input
                                type="number"
                                value={signSalary}
                                min={100}
                                step={100}
                                onChange={(e) => onSalaryChange(Number(e.target.value))}
                                disabled={signing}
                              />
                            </label>
                          </div>
                          <div className="row gap">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={signing}
                              onClick={onSubmit}
                            >
                              {signing ? "签约中…" : "确认签约"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={signing}
                              onClick={onCancelSign}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => onOpenSign(p)}
                        >
                          报价
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
