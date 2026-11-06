/**
 * OperationsCenterPage —— 运营中心页面（v0.6 §批次5）
 *
 * 数据源：
 *   - fetchOperationsOverview(teamId) → OperationsOverviewView
 *
 * 布局：
 *   1. 球迷中心关键指标卡（fanCount / morale / loyalty / 季票 / 商品收入 / 预测季票）
 *   2. morale 趋势指示 + 近 7 日 fanGrowth
 *   3. 球迷事件流（最近 30 条，含 impact 正负影响）
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { fetchOperationsOverview } from "../api";
import type { OperationsOverviewView } from "../types";

interface Props {
  teamId?: string;
}

const EVENT_LABEL: Record<string, string> = {
  win: "比赛胜利",
  loss: "比赛失利",
  trade: "球员交易",
  signing: "明星签约",
  firing: "教练/职员解雇",
  title: "夺冠",
  scandal: "丑闻",
};

/** morale 颜色 */
function moraleColor(v: number): string {
  if (v > 70) return "#22c55e";
  if (v >= 50) return "#f59e0b";
  return "#ef4444";
}

/** 趋势箭头 */
function trendArrow(trend: "up" | "down" | "stable"): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

function formatMoney(n: number): string {
  return `${n.toLocaleString()} 元`;
}

export function OperationsCenterPage({ teamId }: Props) {
  const { user } = useAuth();
  const resolvedTeamId = teamId || user?.teamId || "";

  const [overview, setOverview] = useState<OperationsOverviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!resolvedTeamId) {
      setLoading(false);
      setError("未关联球队");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOperationsOverview(resolvedTeamId);
      setOverview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [resolvedTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="state"><span className="spinner" /> 加载运营中心数据…</div>;
  }
  if (error) return <div className="state error">{error}</div>;
  if (!overview) return <div className="state muted">暂无数据</div>;

  const { fanCenter: fc, recentEvents, moraleTrend, fanGrowth, projectedSeasonTickets } = overview;

  return (
    <div className="page ops-page">
      <header className="page-head">
        <h2>运营中心</h2>
        <p className="muted">
          球迷中心与运营指标：球迷数量、士气、忠诚度、季票、商品收入（每日由后端结算）。
        </p>
      </header>

      <div className="ops-grid">
        {/* 球迷中心指标卡 */}
        <section className="card ops-metrics">
          <h3>球迷中心</h3>
          <div className="ops-metric-grid">
            <div className="ops-metric">
              <div className="ops-metric-label">球迷数量</div>
              <div className="ops-metric-val">{fc.fanCount.toLocaleString()}</div>
              <div className="ops-metric-sub muted">
                近 7 日 {fanGrowth >= 0 ? "+" : ""}{fanGrowth}
              </div>
            </div>
            <div className="ops-metric">
              <div className="ops-metric-label">球迷士气</div>
              <div className="ops-metric-val" style={{ color: moraleColor(fc.morale) }}>
                {fc.morale}{" "}
                <span className="trend-arrow">{trendArrow(moraleTrend)}</span>
              </div>
              <div className="ops-metric-sub muted">
                {moraleTrend === "up" ? "上升" : moraleTrend === "down" ? "下降" : "稳定"}
              </div>
            </div>
            <div className="ops-metric">
              <div className="ops-metric-label">忠诚度</div>
              <div className="ops-metric-val" style={{ color: moraleColor(fc.loyalty) }}>
                {fc.loyalty}
              </div>
              <div className="ops-metric-sub muted">长期指标</div>
            </div>
            <div className="ops-metric">
              <div className="ops-metric-label">季票销量</div>
              <div className="ops-metric-val">{fc.seasonTicketsSold.toLocaleString()}</div>
              <div className="ops-metric-sub muted">
                预测 {projectedSeasonTickets.toLocaleString()}
              </div>
            </div>
            <div className="ops-metric">
              <div className="ops-metric-label">商品收入</div>
              <div className="ops-metric-val">{formatMoney(fc.merchandiseRevenue)}</div>
              <div className="ops-metric-sub muted">累计</div>
            </div>
          </div>

          {/* morale 进度条 */}
          <div className="ops-morale-bar">
            <div className="ops-morale-label">
              <span>士气</span>
              <strong style={{ color: moraleColor(fc.morale) }}>{fc.morale}/100</strong>
            </div>
            <div className="satisfaction-bar">
              <div
                className="satisfaction-bar-fill"
                style={{ width: `${fc.morale}%`, background: moraleColor(fc.morale) }}
              />
            </div>
          </div>
        </section>

        {/* 球迷事件流 */}
        <section className="card ops-events">
          <h3>球迷事件流（{recentEvents.length}）</h3>
          <p className="muted ops-note">
            每日由后端根据比赛结果/交易/签约/丑闻自动生成，影响球迷士气。
          </p>
          {recentEvents.length === 0 ? (
            <p className="muted">暂无球迷事件</p>
          ) : (
            <ul className="fan-event-list">
              {recentEvents.map((e) => {
                const isPositive = e.impact > 0;
                return (
                  <li key={e.id} className="fan-event">
                    <div className="fan-event-main">
                      <div className="fan-event-head">
                        <span className={`badge badge-event-${isPositive ? "pos" : "neg"}`}>
                          {EVENT_LABEL[e.type] ?? e.type}
                        </span>
                        <span className="fan-event-impact" style={{ color: isPositive ? "#22c55e" : "#ef4444" }}>
                          {isPositive ? "+" : ""}{e.impact}
                        </span>
                      </div>
                      <div className="fan-event-note muted">{e.note ?? "—"}</div>
                      <div className="fan-event-meta muted small">
                        第 {e.day} 日 · {new Date(e.createdAt).toLocaleString("zh-CN")}
                      </div>
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
