/**
 * FinancePage v0.6 —— 财务页（对齐 basketpulse `/hk/finances` 布局）
 *
 * 顶部余额卡（深蓝） + 週选择器 + 收支分类汇总（绿/红双栏）+ 流水表 + 赞助商面板
 * 数据来源：v0.6 真实财务系统（CashLedger），无 mock。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchFinanceSummary,
  fetchFinanceCategories,
  fetchFinanceLedger,
  fetchFinanceSponsors,
  fetchTeamSalary,
  type FinanceSummary,
  type CategorySummary,
  type LedgerPage,
  type SponsorInfo,
} from "../api";
import type { SalaryStatus } from "../types";

interface Props {
  teamId: string;
}

const PAGE_SIZE = 20;

const CATEGORY_LABEL: Record<string, string> = {
  sponsor: "赞助商",
  ticket: "票务",
  broadcast: "转播",
  salary: "球员薪资",
  staff: "职员薪资",
  facility: "设施维护",
  academy: "青训投入",
  transfer: "转会",
  fine: "罚款",
  other: "其他",
};

const SUBTYPE_LABEL: Record<string, string> = {
  main_sponsor: "主赞助商",
  kit_sponsor: "装备赞助",
  other_sponsor: "其他赞助",
  win_bonus: "胜场奖金",
  home_game: "主场票务",
  away_share: "客场分红",
  league_share: "联盟分成",
  player_salary: "球员日薪",
  staff_salary: "职员日薪",
  maintenance: "设施维护",
  invest: "青训投入",
  fee_in: "转入收入",
  fee_out: "转出支出",
  league_fine: "联盟罚款",
};

/** 格式化金额：千分位 */
function formatMoney(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${formatMoney(n)}`;
}

export function FinancePage({ teamId }: Props) {
  const { user } = useAuth();
  const resolvedTeamId = teamId || user?.teamId || "";

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [categories, setCategories] = useState<CategorySummary | null>(null);
  const [ledger, setLedger] = useState<LedgerPage | null>(null);
  const [sponsors, setSponsors] = useState<SponsorInfo[]>([]);
  const [salary, setSalary] = useState<SalaryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 週选择器：1 ~ 13（赛季 90 日 / 7 ≈ 13 周）
  const [week, setWeek] = useState(1);
  const weekFrom = (week - 1) * 7 + 1;
  const weekTo = week * 7;

  // 流水筛选
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [page, setPage] = useState(0);

  const load = useCallback(() => {
    if (!resolvedTeamId) {
      setLoading(false);
      setError("未关联球队，无法加载财务数据");
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchFinanceSummary(resolvedTeamId),
      fetchFinanceCategories(resolvedTeamId, { from: weekFrom, to: weekTo }),
      fetchFinanceLedger(resolvedTeamId, {
        from: weekFrom,
        to: weekTo,
        category: filterCategory || undefined,
        incomeOnly: filterType === "income",
        expenseOnly: filterType === "expense",
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
      fetchFinanceSponsors(resolvedTeamId),
      fetchTeamSalary(resolvedTeamId).catch(() => null),
    ])
      .then(([s, c, l, sp, sal]) => {
        setSummary(s);
        setCategories(c);
        setLedger(l);
        setSponsors(sp);
        if (sal) setSalary(sal);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [resolvedTeamId, weekFrom, weekTo, filterCategory, filterType, page]);

  useEffect(() => {
    load();
  }, [load]);

  /** 流水导出 CSV */
  function exportLedger() {
    if (!ledger || ledger.entries.length === 0) return;
    const headers = ["日", "分类", "子类", "金额", "备注"];
    const lines = [headers.join(",")];
    for (const e of ledger.entries) {
      const row = [
        String(e.day),
        CATEGORY_LABEL[e.category] ?? e.category,
        SUBTYPE_LABEL[e.subType] ?? e.subType,
        String(e.amount),
        e.note ?? "",
      ].map((s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s));
      lines.push(row.join(","));
    }
    const bom = "\uFEFF";
    const blob = new Blob([bom + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `财务流水_week${week}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 收入 / 支出 总额（本周）
  const totals = useMemo(() => {
    if (!categories) return { income: 0, expense: 0, net: 0 };
    let income = 0;
    let expense = 0;
    for (const cat of Object.values(categories)) {
      income += cat.income;
      expense += cat.expense;
    }
    return { income, expense, net: income - expense };
  }, [categories]);

  if (loading && !summary) {
    return (
      <div className="state">
        <span className="spinner" /> 加载财务数据…
      </div>
    );
  }

  if (error) {
    return <div className="state error">{error}</div>;
  }

  return (
    <div className="page finance-page v06">
      <header className="page-head">
        <h2>财务中心</h2>
        <p className="muted">
          球队真实收支流水 · 数据来源 CashLedger（每日由世界时钟结算写入）
        </p>
      </header>

      {/* 余额卡（深蓝大字，对齐 basketpulse） */}
      <section className="cash-balance-card">
        <div className="cash-balance-main">
          <div className="cash-label">当前现金</div>
          <div className="cash-amount">
            {summary ? formatMoney(summary.balance) : "—"}
          </div>
          {summary && summary.debt > 0 && (
            <div className="cash-debt">负债 {formatMoney(summary.debt)}</div>
          )}
        </div>
        <div className="cash-balance-side">
          <div className="cash-net-row">
            <span className="cash-net-label">本日净</span>
            <span
              className="cash-net-val"
              style={{ color: (summary?.todayNet ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}
            >
              {summary ? signed(summary.todayNet) : "—"}
            </span>
          </div>
          <div className="cash-net-row">
            <span className="cash-net-label">本周净</span>
            <span
              className="cash-net-val"
              style={{ color: (summary?.weekNet ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}
            >
              {summary ? signed(summary.weekNet) : "—"}
            </span>
          </div>
          <div className="cash-net-row">
            <span className="cash-net-label">本赛季净</span>
            <span
              className="cash-net-val"
              style={{ color: (summary?.seasonNet ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}
            >
              {summary ? signed(summary.seasonNet) : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* 週选择器（basketpulse 风格） */}
      <section className="week-selector">
        <span className="week-label">週 {week} · 本周</span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={week <= 1}
          onClick={() => { setWeek(week - 1); setPage(0); }}
        >
          ◀ 上一週
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={week >= 13}
          onClick={() => { setWeek(week + 1); setPage(0); }}
        >
          下一週 ▶
        </button>
        <span className="week-range">
          第 {weekFrom} - {weekTo} 日
        </span>
      </section>

      {/* 收支分类（绿/红双栏，对齐 basketpulse） */}
      <section className="card finance-categories">
        <h3>收支分类（第 {weekFrom}-{weekTo} 日）</h3>
        <div className="categories-grid">
          <div className="cat-col cat-income">
            <h4>收入（绿色）</h4>
            {categories && Object.entries(categories).filter(([, v]) => v.income > 0).length === 0 ? (
              <p className="muted">本周无收入</p>
            ) : (
              <ul className="cat-list">
                {categories && Object.entries(categories)
                  .filter(([, v]) => v.income > 0)
                  .map(([cat, v]) => (
                    <li key={`in-${cat}`}>
                      <span className="cat-name">{CATEGORY_LABEL[cat] ?? cat}</span>
                      <span className="cat-amount pos">+{formatMoney(v.income)}</span>
                    </li>
                  ))}
              </ul>
            )}
            <div className="cat-total">
              <span>收入合计</span>
              <strong className="pos">+{formatMoney(totals.income)}</strong>
            </div>
          </div>

          <div className="cat-col cat-expense">
            <h4>支出（红色）</h4>
            {categories && Object.entries(categories).filter(([, v]) => v.expense > 0).length === 0 ? (
              <p className="muted">本周无支出</p>
            ) : (
              <ul className="cat-list">
                {categories && Object.entries(categories)
                  .filter(([, v]) => v.expense > 0)
                  .map(([cat, v]) => (
                    <li key={`out-${cat}`}>
                      <span className="cat-name">{CATEGORY_LABEL[cat] ?? cat}</span>
                      <span className="cat-amount neg">-{formatMoney(v.expense)}</span>
                    </li>
                  ))}
              </ul>
            )}
            <div className="cat-total">
              <span>支出合计</span>
              <strong className="neg">-{formatMoney(totals.expense)}</strong>
            </div>
          </div>
        </div>
        <div className="cat-net-row">
          <span>本周净额</span>
          <strong style={{ color: totals.net >= 0 ? "#22c55e" : "#ef4444" }}>
            {signed(totals.net)}
          </strong>
        </div>
      </section>

      {/* 流水表（3 列：日期/描述/数量，对齐 basketpulse） */}
      <section className="card finance-ledger">
        <div className="ledger-head">
          <h3>流水明细</h3>
          <div className="ledger-filters">
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}
              className="ledger-filter-select"
            >
              <option value="">全部分类</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="ledger-type-group" role="group">
              {(["all", "income", "expense"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn btn-sm ${filterType === t ? "btn-active" : "btn-ghost"}`}
                  onClick={() => { setFilterType(t); setPage(0); }}
                >
                  {t === "all" ? "全部" : t === "income" ? "收入" : "支出"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-export"
              onClick={exportLedger}
              disabled={!ledger || ledger.entries.length === 0}
              title="导出当前筛选结果为 CSV"
            >
              ⬇ CSV
            </button>
          </div>
        </div>

        {ledger && ledger.entries.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="table ledger-table">
                <thead>
                  <tr>
                    <th className="col-day">日期</th>
                    <th>描述</th>
                    <th className="col-amount">数量</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="col-day">第 {e.day} 日</td>
                      <td>
                        <span className="ledger-cat-badge" data-cat={e.category}>
                          {CATEGORY_LABEL[e.category] ?? e.category}
                        </span>
                        {e.note ?? SUBTYPE_LABEL[e.subType] ?? e.subType}
                      </td>
                      <td
                        className="col-amount"
                        style={{ color: e.amount >= 0 ? "#22c55e" : "#ef4444" }}
                      >
                        {signed(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ledger-pagination">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={page <= 0}
                onClick={() => setPage(page - 1)}
              >
                ◀ 上一页
              </button>
              <span className="page-info">
                第 {page + 1} / {Math.max(1, Math.ceil((ledger?.total ?? 0) / PAGE_SIZE))} 页
                （共 {ledger?.total ?? 0} 条）
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={!ledger || page >= Math.ceil(ledger.total / PAGE_SIZE) - 1}
                onClick={() => setPage(page + 1)}
              >
                下一页 ▶
              </button>
            </div>
          </>
        ) : (
          <p className="muted">本周暂无流水记录（等待世界时钟推进结算）</p>
        )}
      </section>

      {/* 赞助商面板 */}
      <section className="card finance-sponsors">
        <h3>赞助商</h3>
        {sponsors.length === 0 ? (
          <p className="muted">暂无赞助商（首次结算时自动初始化）</p>
        ) : (
          <div className="table-wrap">
            <table className="table sponsors-table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>名称</th>
                  <th>档位</th>
                  <th>赛季基础</th>
                  <th>胜场奖金</th>
                  <th>满意度</th>
                  <th>合同</th>
                </tr>
              </thead>
              <tbody>
                {sponsors.map((s) => (
                  <tr key={s.id}>
                    <td>{s.type === "main" ? "主赞助商" : s.type === "kit" ? "装备赞助" : s.type}</td>
                    <td>{s.name}</td>
                    <td>
                      <span className={`tier-badge tier-${s.tier}`}>{s.tier}</span>
                    </td>
                    <td className="num">{formatMoney(s.basePerSeason)}</td>
                    <td className="num">{formatMoney(s.bonusPerWin)}</td>
                    <td>
                      <div className="satisfaction-bar">
                        <div
                          className="satisfaction-fill"
                          style={{
                            width: `${s.satisfaction}%`,
                            background:
                              s.satisfaction >= 70 ? "#22c55e"
                              : s.satisfaction >= 40 ? "#f59e0b"
                              : "#ef4444",
                          }}
                        />
                        <span className="satisfaction-text">{s.satisfaction}</span>
                      </div>
                    </td>
                    <td>
                      {s.startSeason} - {s.endSeason ?? "至今"}（{s.contractSeasons} 年）
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 薪资摘要（保留原薪资帽信息，作为支出参考） */}
      {salary && (
        <section className="card finance-salary">
          <h3>薪资摘要</h3>
          <dl className="kv">
            <div>
              <dt>薪资总额（年薪）</dt>
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
        </section>
      )}

      <p className="muted finance-foot-note">
        说明：本页所有数据均来自后端真实财务系统（TeamCash + CashLedger），
        每日由世界时钟自动结算写入，无 mock 数据。
      </p>
    </div>
  );
}
