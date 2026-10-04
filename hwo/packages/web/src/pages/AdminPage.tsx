/**
 * AdminPage — 隐藏的管理后台
 *
 * P2：统一承载 analytics / audit / simconfig 三个后端模块的前端界面。
 * 仅管理员可见（通过 URL 直接访问，生产环境应加 AdminGuard）。
 *
 * 标签页：
 *   1. 数据概览（DAU / 留存 / 事件流）
 *   2. 审计（比赛异常扫描 / 重放验证）
 *   3. Sim 配置（热更新 / 回滚 / 重置）
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchDau,
  fetchRetentionSeries,
  fetchAnalyticsEvents,
  fetchAuditScan,
  fetchAuditReplay,
  fetchSimConfig,
  fetchSimConfigHistory,
  postSimConfigUpdate,
  postSimConfigRollback,
  postSimConfigReset,
} from "../api";
import type {
  DauOverview,
  RetentionPoint,
  AnalyticsEvent,
  AuditScanResult,
  AuditReplayResult,
  SimConfigActive,
  SimConfigVersion,
} from "../types";

type Tab = "analytics" | "audit" | "simconfig";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("analytics");

  return (
    <div className="page">
      <header className="page-head">
        <h2>管理后台</h2>
        <p className="muted">运营数据 · 审计 · Sim 配置热更新</p>
      </header>

      <div className="admin-tabs">
        <button
          className={tab === "analytics" ? "active" : ""}
          onClick={() => setTab("analytics")}
        >数据概览</button>
        <button
          className={tab === "audit" ? "active" : ""}
          onClick={() => setTab("audit")}
        >审计</button>
        <button
          className={tab === "simconfig" ? "active" : ""}
          onClick={() => setTab("simconfig")}
        >Sim 配置</button>
      </div>

      {tab === "analytics" && <AnalyticsPanel />}
      {tab === "audit" && <AuditPanel />}
      {tab === "simconfig" && <SimConfigPanel />}
    </div>
  );
}

// ── 数据概览 ──

function AnalyticsPanel() {
  const [dau, setDau] = useState<DauOverview | null>(null);
  const [retention, setRetention] = useState<RetentionPoint[]>([]);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, r, e] = await Promise.all([
        fetchDau(),
        fetchRetentionSeries(14, "d1"),
        fetchAnalyticsEvents({ limit: 50 }),
      ]);
      setDau(d);
      setRetention(r);
      setEvents(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="state"><span className="spinner" /> 加载中…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="admin-section">
      {/* DAU 概览 */}
      <section className="admin-card">
        <h3>DAU 概览</h3>
        {dau ? (
          <div className="stat-row">
            <div className="stat-item">
              <span className="stat-value">{dau.dau}</span>
              <span className="stat-label">日活</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{dau.wau}</span>
              <span className="stat-label">周活</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{dau.mau}</span>
              <span className="stat-label">月活</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{dau.paying}</span>
              <span className="stat-label">付费数</span>
            </div>
          </div>
        ) : <p className="muted">暂无数据</p>}
      </section>

      {/* 留存曲线 */}
      <section className="admin-card">
        <h3>D+1 留存（近 14 天）</h3>
        {retention.length > 0 ? (
          <div className="retention-chart">
            {retention.map((p) => (
              <div key={p.date} className="retention-bar-row">
                <span className="retention-date">{p.date.slice(5)}</span>
                <div className="retention-bar-track">
                  <div
                    className="retention-bar-fill"
                    style={{ width: `${Math.max(p.rate * 100, 2)}%` }}
                  />
                  <span className="retention-bar-label">
                    {p.cohort}→{p.retained} ({(p.rate * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="muted">暂无留存数据</p>}
      </section>

      {/* 事件流 */}
      <section className="admin-card">
        <h3>最近事件流（50 条）</h3>
        <table className="data-table">
          <thead>
            <tr><th>时间</th><th>事件</th><th>分类</th><th>用户</th></tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="muted">{new Date(e.createdAt).toLocaleString("zh-CN")}</td>
                <td>{e.event}</td>
                <td><span className="tag">{e.category}</span></td>
                <td className="muted">{e.userId ?? "—"}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={4} className="muted center">暂无事件</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ── 审计 ──

function AuditPanel() {
  const [scanResults, setScanResults] = useState<AuditScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayId, setReplayId] = useState("");
  const [replayResult, setReplayResult] = useState<AuditReplayResult | null>(null);
  const [replaying, setReplaying] = useState(false);

  async function doScan() {
    setLoading(true);
    setError(null);
    try {
      const results = await fetchAuditScan(100);
      setScanResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doReplay() {
    if (!replayId) return;
    setReplaying(true);
    setError(null);
    try {
      const result = await fetchAuditReplay(replayId);
      setReplayResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReplaying(false);
    }
  }

  useEffect(() => { doScan(); }, []);

  const anomalies = scanResults.filter((r) => r.anomaly);

  return (
    <div className="admin-section">
      <section className="admin-card">
        <h3>比赛异常扫描</h3>
        <div className="admin-toolbar">
          <button onClick={doScan} disabled={loading}>
            {loading ? "扫描中…" : "重新扫描"}
          </button>
          <span className="muted">
            共 {scanResults.length} 场，{anomalies.length} 场异常
          </span>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <table className="data-table">
          <thead>
            <tr><th>比赛 ID</th><th>主队</th><th>客队</th><th>比分</th><th>状态</th></tr>
          </thead>
          <tbody>
            {anomalies.map((r) => (
              <tr key={r.matchId} className={r.anomaly ? "row-anomaly" : ""}>
                <td className="mono">{r.matchId.slice(0, 8)}</td>
                <td className="mono">{r.homeTeamId.slice(0, 8)}</td>
                <td className="mono">{r.awayTeamId.slice(0, 8)}</td>
                <td>{r.homeScore} : {r.awayScore}</td>
                <td>
                  {r.anomaly
                    ? <span className="tag tag-warn">异常：{r.reason}</span>
                    : <span className="tag tag-ok">正常</span>}
                </td>
              </tr>
            ))}
            {anomalies.length === 0 && !loading && (
              <tr><td colSpan={5} className="muted center">未检测到异常比赛</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="admin-card">
        <h3>比赛重放验证</h3>
        <div className="admin-toolbar">
          <input
            type="text"
            placeholder="输入比赛 ID"
            value={replayId}
            onChange={(e) => setReplayId(e.target.value)}
            className="admin-input"
          />
          <button onClick={doReplay} disabled={replaying || !replayId}>
            {replaying ? "重放中…" : "重放验证"}
          </button>
        </div>
        {replayResult && (
          <div className="replay-result">
            <p>比赛 ID: <code>{replayResult.matchId.slice(0, 12)}</code></p>
            <p>重放成功: {replayResult.replayed ? "✓" : "✗"}</p>
            <p>重放比分: {replayResult.homeScore} : {replayResult.awayScore}</p>
            {replayResult.mismatch && (
              <p className="tag tag-warn">
                比分不一致！原始: {replayResult.originalHomeScore} : {replayResult.originalAwayScore}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Sim 配置 ──

function SimConfigPanel() {
  const [config, setConfig] = useState<SimConfigActive | null>(null);
  const [history, setHistory] = useState<SimConfigVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState({
    quarterLength: 0,
    possessionsPerQuarter: 0,
    homeAdvantage: 0,
    basePossessionTime: 0,
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, h] = await Promise.all([
        fetchSimConfig(),
        fetchSimConfigHistory(),
      ]);
      setConfig(c);
      setEditConfig({
        quarterLength: c.quarterLength,
        possessionsPerQuarter: c.possessionsPerQuarter,
        homeAdvantage: c.homeAdvantage,
        basePossessionTime: c.basePossessionTime,
      });
      setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUpdate() {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, number> = {};
      if (editConfig.quarterLength !== config?.quarterLength)
        patch.quarterLength = editConfig.quarterLength;
      if (editConfig.possessionsPerQuarter !== config?.possessionsPerQuarter)
        patch.possessionsPerQuarter = editConfig.possessionsPerQuarter;
      if (editConfig.homeAdvantage !== config?.homeAdvantage)
        patch.homeAdvantage = editConfig.homeAdvantage;
      if (editConfig.basePossessionTime !== config?.basePossessionTime)
        patch.basePossessionTime = editConfig.basePossessionTime;

      if (Object.keys(patch).length === 0) {
        setError("无变更");
        setSaving(false);
        return;
      }
      const updated = await postSimConfigUpdate(patch, note || "管理后台热更新");
      setConfig(updated);
      setNote("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRollback(version: number) {
    setSaving(true);
    setError(null);
    try {
      const updated = await postSimConfigRollback(version);
      setConfig(updated);
      setEditConfig({
        quarterLength: updated.quarterLength,
        possessionsPerQuarter: updated.possessionsPerQuarter,
        homeAdvantage: updated.homeAdvantage,
        basePossessionTime: updated.basePossessionTime,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError(null);
    try {
      const updated = await postSimConfigReset();
      setConfig(updated);
      setEditConfig({
        quarterLength: updated.quarterLength,
        possessionsPerQuarter: updated.possessionsPerQuarter,
        homeAdvantage: updated.homeAdvantage,
        basePossessionTime: updated.basePossessionTime,
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="state"><span className="spinner" /> 加载配置…</div>;

  return (
    <div className="admin-section">
      {error && <div className="alert alert-error">{error}</div>}

      {/* 当前配置 */}
      <section className="admin-card">
        <h3>当前生效配置 (v{config?.version})</h3>
        <div className="config-grid">
          <label className="config-field">
            <span>每节时长</span>
            <input
              type="number"
              value={editConfig.quarterLength}
              onChange={(e) => setEditConfig({ ...editConfig, quarterLength: +e.target.value })}
            />
          </label>
          <label className="config-field">
            <span>每节回合数</span>
            <input
              type="number"
              value={editConfig.possessionsPerQuarter}
              onChange={(e) => setEditConfig({ ...editConfig, possessionsPerQuarter: +e.target.value })}
            />
          </label>
          <label className="config-field">
            <span>主场优势</span>
            <input
              type="number"
              step="0.01"
              value={editConfig.homeAdvantage}
              onChange={(e) => setEditConfig({ ...editConfig, homeAdvantage: +e.target.value })}
            />
          </label>
          <label className="config-field">
            <span>基础回合时间</span>
            <input
              type="number"
              value={editConfig.basePossessionTime}
              onChange={(e) => setEditConfig({ ...editConfig, basePossessionTime: +e.target.value })}
            />
          </label>
        </div>
        <div className="admin-toolbar">
          <input
            type="text"
            placeholder="变更说明"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="admin-input"
          />
          <button onClick={handleUpdate} disabled={saving}>热更新</button>
          <button onClick={handleReset} disabled={saving} className="btn-danger">重置默认</button>
        </div>
      </section>

      {/* 配置历史 */}
      <section className="admin-card">
        <h3>配置历史</h3>
        <table className="data-table">
          <thead>
            <tr><th>版本</th><th>说明</th><th>时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.version}>
                <td>v{h.version}</td>
                <td>{h.note}</td>
                <td className="muted">{new Date(h.createdAt).toLocaleString("zh-CN")}</td>
                <td>
                  {h.version !== config?.version && (
                    <button
                      className="btn-mini"
                      onClick={() => handleRollback(h.version)}
                      disabled={saving}
                    >回滚</button>
                  )}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={4} className="muted center">暂无历史</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
