/**
 * BoardOfDirectorsPage —— 董事会页（v0.6 §批次4 重构）
 *
 * 数据源（真实，对齐后端 BoardService）：
 *   - fetchBoard(teamId)                → BoardView（董事 + 赞助商 + 目标 + 提案 + 满意度）
 *   - fetchTeamSalary(teamId)           → 薪资帽使用情况（预算面板）
 *   - fetchWallet()                     → 经理钱包（仅作展示）
 *
 * 与早期 mock 版本的区别：
 *   - 满意度三向（球迷/老板/赞助商）由后端按战绩/财务/公式计算，前端只读
 *   - 提案为后端每日触发自动生成，含董事投票结果；经理可对 approved 提案点击"忽略"
 *   - 赛季目标按 OVR/上赛季战绩/薪资占比自动生成，含 basisNote 说明依据
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchBoard,
  fetchTeamSalary,
  fetchWallet,
  dismissBoardProposal,
} from "../api";
import type {
  BoardView,
  BoardProposalView,
  SalaryStatus,
  WalletInfo,
} from "../types";

interface Props {
  teamId?: string;
}

/** 格式化金额：千分位 + ¥ 前缀（与 finance 页统一） */
function formatMoney(n: number): string {
  return `${n.toLocaleString()} 元`;
}

/** 满意度颜色：>70 绿 / 50-70 黄 / <50 红 */
function satisfactionColor(value: number): string {
  if (value > 70) return "#22c55e";
  if (value >= 50) return "#f59e0b";
  return "#ef4444";
}

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  pending: "待投票",
  approved: "已通过",
  rejected: "已否决",
  expired: "已忽略",
};

export function BoardOfDirectorsPage({ teamId }: Props) {
  const { user } = useAuth();
  const resolvedTeamId = teamId || user?.teamId || "";

  const [board, setBoard] = useState<BoardView | null>(null);
  const [salary, setSalary] = useState<SalaryStatus | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!resolvedTeamId) {
      setLoading(false);
      setError("未关联球队，无法加载董事会数据");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [b, sal, w] = await Promise.all([
        fetchBoard(resolvedTeamId),
        fetchTeamSalary(resolvedTeamId).catch(() => null),
        fetchWallet().catch(() => null),
      ]);
      setBoard(b);
      setSalary(sal);
      setWallet(w);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [resolvedTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  /** 经理忽略已 approved 提案 */
  const handleDismiss = useCallback(
    async (p: BoardProposalView) => {
      if (!resolvedTeamId || busy) return;
      setBusy(true);
      try {
        await dismissBoardProposal(p.id, resolvedTeamId);
        await load();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [resolvedTeamId, busy, load],
  );

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

  if (!board) {
    return <div className="state muted">暂无董事会数据</div>;
  }

  const fan = board.fanSatisfaction;
  const boss = board.bossSatisfaction;
  const sponsor = board.avgSponsorSatisfaction;
  const goal = board.goal;

  return (
    <div className="page bod-page">
      <header className="page-head">
        <h2>董事会</h2>
        <p className="muted">
          球队治理与决策中心：满意度、赛季目标、赞助商、董事与提案（数据每日由后端结算）。
        </p>
      </header>

      <div className="bod-grid">
        {/* 满意度面板 */}
        <section className="card bod-panel">
          <h3>满意度</h3>
          <p className="muted bod-note">
            球迷 = 战绩胜率推算；老板 = 薪资/现金健康度推算；赞助商 = 战绩/球迷士气推算（每日更新）。
          </p>
          <SatisfactionBar
            label="球迷满意度"
            value={fan}
            hint="由本季胜率推算"
          />
          <SatisfactionBar
            label="老板满意度"
            value={boss}
            hint={
              salary
                ? `薪资总额 ${formatMoney(salary.totalSalary)} / 帽 ${formatMoney(salary.salaryCap)}`
                : "暂无薪资数据"
            }
          />
          <SatisfactionBar
            label="赞助商满意度"
            value={sponsor}
            hint={`${board.sponsors.length} 个赞助商的平均值`}
          />
        </section>

        {/* 赛季目标面板 */}
        <section className="card bod-panel">
          <h3>赛季目标</h3>
          {goal ? (
            <>
              <p className="muted bod-note">
                {goal.season} 赛季 · 自动制定
              </p>
              <ul className="bod-goal-list">
                <GoalRow
                  label={`胜率超过 ${(goal.expectedWinRate * 100).toFixed(0)}%`}
                  progress={Math.min(100, Math.round(goal.expectedWinRate * 100))}
                  status="in_progress"
                />
                <GoalRow
                  label={goal.expectedPlayoff ? "进入季后赛" : "不要求季后赛"}
                  progress={goal.expectedPlayoff ? 50 : 100}
                  status={goal.expectedPlayoff ? "in_progress" : "completed"}
                />
                <GoalRow
                  label={goal.expectedChampionship ? "冲击总冠军" : "夺冠否"}
                  progress={goal.expectedChampionship ? 30 : 100}
                  status={goal.expectedChampionship ? "in_progress" : "completed"}
                />
                {goal.expectedRank && (
                  <GoalRow
                    label={`常规赛排名进入前 ${goal.expectedRank}`}
                    progress={Math.min(100, (goal.expectedRank / 16) * 100)}
                    status="in_progress"
                  />
                )}
              </ul>
              <details className="bod-goal-basis">
                <summary className="muted">制定依据</summary>
                <p className="muted small">{goal.basisNote}</p>
              </details>
            </>
          ) : (
            <p className="muted">尚未生成赛季目标</p>
          )}
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

        {/* 赞助商面板 */}
        <section className="card bod-panel">
          <h3>赞助商（{board.sponsors.length}）</h3>
          {board.sponsors.length === 0 ? (
            <p className="muted">暂无赞助商</p>
          ) : (
            <div className="roster-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>名称</th>
                    <th>档位</th>
                    <th>赛季分成</th>
                    <th>胜场奖金</th>
                    <th>满意度</th>
                  </tr>
                </thead>
                <tbody>
                  {board.sponsors.map((s) => (
                    <tr key={s.id}>
                      <td>{sponsorTypeLabel(s.type)}</td>
                      <td className="st-name">{s.name}</td>
                      <td>
                        <span className={`badge badge-tier-${s.tier}`}>
                          {s.tier}
                        </span>
                      </td>
                      <td>{formatMoney(s.basePerSeason)}</td>
                      <td>{formatMoney(s.bonusPerWin)}/胜</td>
                      <td>
                        <strong
                          style={{ color: satisfactionColor(s.satisfaction) }}
                        >
                          {s.satisfaction}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 董事列表 */}
        <section className="card bod-panel">
          <h3>董事（{board.directors.length}）</h3>
          {board.directors.length === 0 ? (
            <p className="muted">暂无董事</p>
          ) : (
            <ul className="bod-director-list">
              {board.directors.map((d) => (
                <li key={d.id} className="bod-director">
                  <div className="bod-director-main">
                    <div className="bod-director-name">{d.name}</div>
                    <div className="bod-director-role muted">
                      {d.roleLabel}
                    </div>
                  </div>
                  <div className="bod-director-loyalty">
                    <span className="muted small">忠诚度</span>
                    <strong
                      style={{ color: satisfactionColor(d.loyalty) }}
                    >
                      {d.loyalty}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 决策面板：提案列表 */}
        <section className="card bod-panel bod-proposals">
          <h3>董事会提案（{board.proposals.length}）</h3>
          <p className="muted bod-note">
            提案由后端每日检测触发条件自动生成，董事按 loyalty 加权投票，结果通过球队讯息通知经理。
          </p>
          {board.proposals.length === 0 ? (
            <p className="muted">暂无提案</p>
          ) : (
            <ul className="bod-proposal-list">
              {board.proposals.map((p) => {
                const votes = Array.isArray(p.votes) ? (p.votes as VoteEntry[]) : [];
                const yes = votes.filter((v) => v.approved).length;
                const no = votes.length - yes;
                return (
                  <li key={p.id} className="bod-proposal">
                    <div className="bod-proposal-main">
                      <div className="bod-proposal-title">
                        {p.typeLabel}{" "}
                        <span className={`badge badge-proposal-${p.status}`}>
                          {PROPOSAL_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <div className="bod-proposal-desc">{p.reason}</div>
                      <div className="bod-proposal-meta">
                        <span className="muted small">
                          第 {p.day} 日 · 投票 {yes} 赞成 / {no} 反对
                        </span>
                      </div>
                    </div>
                    <div className="bod-proposal-action">
                      {p.status === "approved" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => handleDismiss(p)}
                        >
                          忽略
                        </button>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ── 子组件 ──

/** 满意度进度条 */
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

/** 赛季目标行 */
function GoalRow({
  label,
  progress,
  status,
}: {
  label: string;
  progress: number;
  status: "in_progress" | "completed" | "failed";
}) {
  return (
    <li className="bod-goal">
      <div className="bod-goal-head">
        <span className="bod-goal-label">{label}</span>
        <span className={`bod-goal-status bod-goal-status-${status}`}>
          {status === "completed" ? "已完成" : status === "failed" ? "失败" : "进行中"}
        </span>
      </div>
      <div className="bod-goal-track">
        <div
          className="bod-goal-fill"
          style={{
            width: `${progress}%`,
            background: satisfactionColor(progress),
          }}
        />
      </div>
      <div className="bod-goal-pct">{progress.toFixed(0)}%</div>
    </li>
  );
}

interface VoteEntry {
  directorId: string;
  directorName: string;
  directorRole: string;
  approved: boolean;
  loyalty: number;
}

/** 赞助商类型中文名 */
function sponsorTypeLabel(type: string): string {
  switch (type) {
    case "main":
      return "主赞助商";
    case "kit":
      return "装备";
    case "arena":
      return "球馆";
    case "broadcast":
      return "转播";
    default:
      return type;
  }
}
