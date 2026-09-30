/**
 * BoardOfDirectorsPage —— 董事会页
 *
 * 参考 Rim Attack 董事会：
 *   - 满意度面板：球迷 / 老板 / 赞助商 三向满意度，进度条可视化
 *     · 球迷满意度 = 战绩胜率推算（winRate * 100）
 *     · 老板满意度 = 财务状况推算（remaining / salaryCap * 100）
 *     · 赞助商满意度 = mock 初始值 70
 *     · 颜色按值变化：>70 绿 / 50-70 黄 / <50 红
 *   - 赛季目标面板：目标列表 + 完成进度 + 状态（进行中 / 已完成 / 失败）
 *   - 球队预算面板：调用 fetchTeamSalary(teamId) 与 fetchWallet()
 *   - 决策面板：董事会提案列表（mock），含预估费用、效果与"批准"按钮
 *
 * 数据来源：
 *   - fetchStandings()        → 积分榜（取我的球队 winRate）
 *   - fetchTeamSalary(teamId) → 薪资帽使用情况
 *   - fetchWallet()           → 当前资金
 *   - fetchCurrentSeason()    → 赛季信息（用于目标判定）
 *
 * 满意度与目标进度部分为前端 mock 推算。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchCurrentSeason,
  fetchStandings,
  fetchTeamSalary,
  fetchWallet,
} from "../api";
import type {
  SalaryStatus,
  SeasonInfo,
  StandingRow,
  WalletInfo,
} from "../types";

interface Props {
  teamId?: string;
}

type GoalStatus = "in_progress" | "completed" | "failed";

interface SeasonGoal {
  id: string;
  label: string;
  /** 0-100 完成进度 */
  progress: number;
  status: GoalStatus;
}

interface BodProposal {
  id: string;
  title: string;
  desc: string;
  /** 预估费用（Coins） */
  cost: number;
  /** 效果说明 */
  effect: string;
}

const STATUS_LABEL: Record<GoalStatus, string> = {
  in_progress: "进行中",
  completed: "已完成",
  failed: "失败",
};

/** 格式化金额：千分位 + $ 前缀 */
function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

/** 满意度颜色：>70 绿 / 50-70 黄 / <50 红 */
function satisfactionColor(value: number): string {
  if (value > 70) return "#22c55e";
  if (value >= 50) return "#f59e0b";
  return "#ef4444";
}

/** 限制满意度在 0-100 */
function clamp(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/** mock 董事会提案（前端固定列表） */
const PROPOSALS: BodProposal[] = [
  {
    id: "prop_academy",
    title: "增加青训投资",
    desc: "向青训学院追加投入，提升新秀产出潜力上限。",
    cost: 80000,
    effect: "青训新秀潜力 +5，下赛季产出概率提升",
  },
  {
    id: "prop_arena",
    title: "扩建球馆",
    desc: "扩容主场座位，提升门票与赞助收入。",
    cost: 150000,
    effect: "主场上座率 +15%，赛季收入 +20%",
  },
  {
    id: "prop_star",
    title: "签约明星球员",
    desc: "引进一名高 OVR 明星，提升即战力与关注度。",
    cost: 200000,
    effect: "球队 OVR +3，球迷满意度 +10",
  },
  {
    id: "prop_marketing",
    title: "加强市场营销",
    desc: "扩大品牌曝光，提升赞助商与球迷关注度。",
    cost: 50000,
    effect: "赞助商满意度 +8，球迷满意度 +5",
  },
];

export function BoardOfDirectorsPage({ teamId }: Props) {
  const { user } = useAuth();
  const resolvedTeamId = teamId || user?.teamId || "";

  const [standings, setStandings] = useState<StandingRow[] | null>(null);
  const [salary, setSalary] = useState<SalaryStatus | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 提案批准状态（mock：仅前端标记，无后端落库）
  const [approved, setApproved] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    if (!resolvedTeamId) {
      setLoading(false);
      setError("未关联球队，无法加载董事会数据");
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchStandings(),
      fetchTeamSalary(resolvedTeamId),
      fetchWallet(),
      fetchCurrentSeason(),
    ])
      .then(([s, sal, w, sea]) => {
        setStandings(s);
        setSalary(sal);
        setWallet(w);
        setSeason(sea);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [resolvedTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  // 我的球队战绩行
  const myRow = useMemo<StandingRow | null>(() => {
    if (!standings || !resolvedTeamId) return null;
    return standings.find((r) => r.teamId === resolvedTeamId) ?? null;
  }, [standings, resolvedTeamId]);

  // 球迷满意度：winRate * 100（无战绩则默认 50）
  const fanSatisfaction = clamp(
    myRow && myRow.wins + myRow.losses > 0 ? myRow.winRate * 100 : 50,
  );
  // 老板满意度：remaining / salaryCap * 100（薪资帽为 0 则默认 50）
  const bossSatisfaction = clamp(
    salary && salary.salaryCap > 0
      ? (salary.remaining / salary.salaryCap) * 100
      : 50,
  );
  // 赞助商满意度：mock 初始值 70
  const sponsorSatisfaction = 70;

  // 赛季目标：依据真实战绩 / 薪资空间推算进度与状态（mock 阈值）
  const goals = useMemo<SeasonGoal[]>(() => {
    const winRate = myRow && myRow.wins + myRow.losses > 0 ? myRow.winRate : 0;
    const capUsagePct =
      salary && salary.salaryCap > 0
        ? (salary.totalSalary / salary.salaryCap) * 100
        : 0;
    return [
      {
        id: "goal_playoff",
        label: "进入季后赛",
        // 胜率 >= 50% 视为达成（mock 阈值）
        progress: clamp(winRate * 100),
        status: winRate >= 0.5 ? "completed" : "in_progress",
      },
      {
        id: "goal_winrate",
        label: "胜率超过 50%",
        progress: clamp(winRate * 100),
        status:
          winRate >= 0.5
            ? "completed"
            : winRate > 0
              ? "in_progress"
              : "failed",
      },
      {
        id: "goal_ovr80",
        label: "球队 OVR 达到 80",
        // 无球队 OVR API，使用薪资使用率作为代理（薪资健康视为阵容达标）
        progress: clamp(100 - capUsagePct),
        status: capUsagePct > 0 && capUsagePct <= 80 ? "completed" : "in_progress",
      },
    ];
  }, [myRow, salary]);

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载董事会数据…
      </div>
    );
  }

  if (error) {
    return <div className="state error">{error}</div>;
  }

  return (
    <div className="page bod-page">
      <header className="page-head">
        <h2>董事会</h2>
        <p className="muted">
          球队治理与决策中心，参考 Rim Attack 董事会：满意度、赛季目标、预算与提案。
        </p>
      </header>

      <div className="bod-grid">
        {/* 满意度面板 */}
        <section className="card bod-panel">
          <h3>满意度</h3>
          <p className="muted bod-note">
            球迷 = 战绩胜率推算；老板 = 薪资空间推算；赞助商 = mock 初始值。
          </p>
          <SatisfactionBar
            label="球迷满意度"
            value={fanSatisfaction}
            hint={
              myRow
                ? `${myRow.teamName} ${myRow.wins}胜${myRow.losses}负 · 胜率 ${(myRow.winRate * 100).toFixed(1)}%`
                : "暂无战绩数据"
            }
          />
          <SatisfactionBar
            label="老板满意度"
            value={bossSatisfaction}
            hint={
              salary
                ? `剩余 ${formatMoney(salary.remaining)} / 帽 ${formatMoney(salary.salaryCap)}`
                : "暂无薪资数据"
            }
          />
          <SatisfactionBar
            label="赞助商满意度"
            value={sponsorSatisfaction}
            hint="mock 初始值 70"
          />
        </section>

        {/* 赛季目标面板 */}
        <section className="card bod-panel">
          <h3>赛季目标</h3>
          <p className="muted bod-note">
            {season
              ? `${season.name} · 第 ${season.currentDay} 日`
              : "暂无赛季信息"}
          </p>
          <ul className="bod-goal-list">
            {goals.map((g) => (
              <li key={g.id} className="bod-goal">
                <div className="bod-goal-head">
                  <span className="bod-goal-label">{g.label}</span>
                  <span
                    className={`bod-goal-status bod-goal-status-${g.status}`}
                  >
                    {STATUS_LABEL[g.status]}
                  </span>
                </div>
                <div className="bod-goal-track">
                  <div
                    className="bod-goal-fill"
                    style={{
                      width: `${g.progress}%`,
                      background: satisfactionColor(g.progress),
                    }}
                  />
                </div>
                <div className="bod-goal-pct">{g.progress.toFixed(0)}%</div>
              </li>
            ))}
          </ul>
        </section>

        {/* 球队预算面板 */}
        <section className="card bod-panel">
          <h3>球队预算</h3>
          {salary ? (
            <dl className="kv">
              <div>
                <dt>薪资总额</dt>
                <dd>{formatMoney(salary.totalSalary)}</dd>
              </div>
              <div>
                <dt>薪资帽</dt>
                <dd>{formatMoney(salary.salaryCap)}</dd>
              </div>
              <div>
                <dt>剩余空间</dt>
                <dd
                  style={{
                    color: salary.remaining >= 0 ? "#22c55e" : "#ef4444",
                  }}
                >
                  {formatMoney(salary.remaining)}
                </dd>
              </div>
              <div>
                <dt>合同数</dt>
                <dd>{salary.contractCount}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">暂无薪资数据</p>
          )}

          <h4 className="bod-subhead">钱包</h4>
          {wallet ? (
            <div className="wallet-stack">
              <div className="wallet-cell wallet-coins">
                <span className="wallet-icon">🪙</span>
                <div>
                  <div className="wallet-num">
                    {wallet.coins.toLocaleString()}
                  </div>
                  <div className="muted">Coins · 游戏币</div>
                </div>
              </div>
              <div className="wallet-cell wallet-credits">
                <span className="wallet-icon">💎</span>
                <div>
                  <div className="wallet-num">
                    {wallet.credits.toLocaleString()}
                  </div>
                  <div className="muted">Credits · 充值币</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="muted">暂无钱包数据</p>
          )}
        </section>

        {/* 决策面板 */}
        <section className="card bod-panel bod-proposals">
          <h3>董事会提案</h3>
          <p className="muted bod-note">
            前端 mock 提案，"批准" 仅在前端标记，不调用后端。
          </p>
          <ul className="bod-proposal-list">
            {PROPOSALS.map((p) => {
              const isApproved = approved[p.id];
              return (
                <li key={p.id} className="bod-proposal">
                  <div className="bod-proposal-main">
                    <div className="bod-proposal-title">{p.title}</div>
                    <div className="bod-proposal-desc">{p.desc}</div>
                    <div className="bod-proposal-meta">
                      <span className="bod-proposal-cost">
                        预估费用：{formatMoney(p.cost)}
                      </span>
                      <span className="bod-proposal-effect">
                        效果：{p.effect}
                      </span>
                    </div>
                  </div>
                  <div className="bod-proposal-action">
                    {isApproved ? (
                      <span className="badge badge-new">已批准</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          setApproved((prev) => ({ ...prev, [p.id]: true }))
                        }
                      >
                        批准
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** 满意度进度条子组件 */
function SatisfactionBar({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  const color = satisfactionColor(value);
  return (
    <div className="bod-satisfaction">
      <div className="bod-satisfaction-head">
        <span className="bod-satisfaction-label">{label}</span>
        <strong className="bod-satisfaction-value" style={{ color }}>
          {value.toFixed(0)}
        </strong>
      </div>
      <div className="satisfaction-bar">
        <div
          className="satisfaction-bar-fill"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      {hint && <div className="bod-satisfaction-hint muted">{hint}</div>}
    </div>
  );
}
