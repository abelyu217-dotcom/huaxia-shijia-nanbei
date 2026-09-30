/**
 * FinancePage —— 财务页
 *
 * - 薪资帽面板：总额 / 帽 / 剩余 / 合同数 + 使用率进度条（绿/黄/红）
 * - 球员合同表：按年薪降序，展示年限与选项类型
 * - 钱包面板：Coins（游戏币）+ Credits（充值币）
 * - 收支趋势：最近 7 日 mock 数据（无对应后端 API）
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchTeamSalary,
  fetchTeamContracts,
  fetchWallet,
} from "../api";
import type {
  Contract,
  SalaryStatus,
  WalletInfo,
} from "../types";

interface Props {
  teamId: string;
}

/** 格式化金额：千分位 + $ 前缀 */
function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

/** 薪资帽使用率颜色：<70% 绿 / 70-90% 黄 / >90% 红 */
function capUsageColor(pct: number): string {
  if (pct < 70) return "#22c55e";
  if (pct <= 90) return "#f59e0b";
  return "#ef4444";
}

/** 选项类型文案 */
function optionTypeLabel(c: Contract): string {
  if (c.playerOption) return "球员选项";
  if (c.teamOption) return "球队选项";
  if (c.noTrade) return "不可交易";
  return "保障";
}

/** 最近 7 日收支 mock（无后端 API，前端固定种子生成） */
function useMockWeeklyTrend(): Array<{
  day: string;
  income: number;
  expense: number;
  net: number;
}> {
  return useMemo(() => {
    const today = new Date();
    const rows: Array<{ day: string; income: number; expense: number; net: number }> = [];
    // 固定种子，避免每次渲染抖动
    const seedIncomes = [42000, 38000, 51000, 46000, 60000, 33000, 45000];
    const seedExpenses = [28000, 35000, 30000, 40000, 32000, 25000, 38000];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const idx = 6 - i;
      const income = seedIncomes[idx];
      const expense = seedExpenses[idx];
      rows.push({
        day: `${d.getMonth() + 1}/${d.getDate()}`,
        income,
        expense,
        net: income - expense,
      });
    }
    return rows;
  }, []);
}

export function FinancePage({ teamId }: Props) {
  const { user } = useAuth();
  const resolvedTeamId = teamId || user?.teamId || "";

  const [salary, setSalary] = useState<SalaryStatus | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekly = useMockWeeklyTrend();
  const maxAbs = useMemo(
    () => Math.max(1, ...weekly.flatMap((r) => [r.income, r.expense])),
    [weekly],
  );

  const load = useCallback(() => {
    if (!resolvedTeamId) {
      setLoading(false);
      setError("未关联球队，无法加载财务数据");
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTeamSalary(resolvedTeamId),
      fetchTeamContracts(resolvedTeamId),
      fetchWallet(),
    ])
      .then(([s, c, w]) => {
        setSalary(s);
        setContracts(c);
        setWallet(w);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [resolvedTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载财务数据…
      </div>
    );
  }

  if (error) {
    return <div className="state error">{error}</div>;
  }

  // 薪资帽使用率
  const capPct = salary && salary.salaryCap > 0
    ? (salary.totalSalary / salary.salaryCap) * 100
    : 0;
  const capColor = capUsageColor(capPct);

  // 合同按年薪降序
  const sortedContracts = [...contracts].sort(
    (a, b) => b.salaryPerYear - a.salaryPerYear,
  );

  return (
    <div className="page finance-page">
      <header className="page-head">
        <h2>财务中心</h2>
        <p className="muted">
          管理薪资帽、球员合同与钱包余额，掌握球队资金动向。
        </p>
      </header>

      <div className="finance-grid">
        {/* 薪资帽面板 */}
        <section className="card finance-panel">
          <h3>薪资帽</h3>
          {salary ? (
            <>
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
                  <dd style={{ color: salary.remaining >= 0 ? "#22c55e" : "#ef4444" }}>
                    {formatMoney(salary.remaining)}
                  </dd>
                </div>
                <div>
                  <dt>合同数</dt>
                  <dd>{salary.contractCount}</dd>
                </div>
              </dl>

              <div className="salary-bar">
                <div className="salary-bar-label">
                  <span>使用率</span>
                  <strong style={{ color: capColor }}>{capPct.toFixed(1)}%</strong>
                </div>
                <div className="salary-bar-track">
                  <div
                    className="salary-bar-fill"
                    style={{
                      width: `${Math.min(100, capPct)}%`,
                      background: capColor,
                    }}
                  />
                </div>
                <div className="salary-bar-legend">
                  <span className="legend-item">
                    <i style={{ background: "#22c55e" }} /> &lt;70%
                  </span>
                  <span className="legend-item">
                    <i style={{ background: "#f59e0b" }} /> 70-90%
                  </span>
                  <span className="legend-item">
                    <i style={{ background: "#ef4444" }} /> &gt;90%
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="muted">暂无薪资数据</p>
          )}
        </section>

        {/* 钱包面板 */}
        <section className="card finance-panel">
          <h3>钱包</h3>
          {wallet ? (
            <div className="wallet-stack">
              <div className="wallet-cell wallet-coins">
                <span className="wallet-icon">🪙</span>
                <div>
                  <div className="wallet-num">{wallet.coins.toLocaleString()}</div>
                  <div className="muted">Coins · 游戏币</div>
                </div>
              </div>
              <div className="wallet-cell wallet-credits">
                <span className="wallet-icon">💎</span>
                <div>
                  <div className="wallet-num">{wallet.credits.toLocaleString()}</div>
                  <div className="muted">Credits · 充值币</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="muted">暂无钱包数据</p>
          )}
        </section>

        {/* 收支趋势（mock） */}
        <section className="card finance-panel">
          <h3>近 7 日收支</h3>
          <p className="muted finance-note">前端 mock 数据，无后端 API 支撑。</p>
          <div className="trend-chart">
            {weekly.map((r) => (
              <div key={r.day} className="trend-col">
                <div className="trend-bars">
                  <div
                    className="trend-bar trend-bar-income"
                    style={{ height: `${(r.income / maxAbs) * 100}%` }}
                    title={`收入 ${formatMoney(r.income)}`}
                  />
                  <div
                    className="trend-bar trend-bar-expense"
                    style={{ height: `${(r.expense / maxAbs) * 100}%` }}
                    title={`支出 ${formatMoney(r.expense)}`}
                  />
                </div>
                <div className="trend-day">{r.day}</div>
                <div
                  className="trend-net"
                  style={{ color: r.net >= 0 ? "#22c55e" : "#ef4444" }}
                >
                  {r.net >= 0 ? "+" : ""}
                  {r.net.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <div className="salary-bar-legend">
            <span className="legend-item">
              <i style={{ background: "#22c55e" }} /> 收入
            </span>
            <span className="legend-item">
              <i style={{ background: "#ef4444" }} /> 支出
            </span>
          </div>
        </section>
      </div>

      {/* 球员合同表 */}
      <section className="card finance-contracts">
        <h3>球员合同</h3>
        {sortedContracts.length === 0 ? (
          <p className="muted">暂无合同</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>球员</th>
                  <th>位置</th>
                  <th>年薪</th>
                  <th>年限（余/总）</th>
                  <th>选项类型</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {sortedContracts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.player?.name ?? c.playerId}</td>
                    <td className="pos">{c.player?.position ?? "—"}</td>
                    <td className="num">{formatMoney(c.salaryPerYear)}</td>
                    <td>
                      {c.yearsRemain} / {c.yearsTotal}
                    </td>
                    <td>{optionTypeLabel(c)}</td>
                    <td>
                      <span
                        className={`badge ${
                          c.status === "active"
                            ? "badge-new"
                            : c.status === "expired"
                              ? "badge-retire"
                              : "badge-fall"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
