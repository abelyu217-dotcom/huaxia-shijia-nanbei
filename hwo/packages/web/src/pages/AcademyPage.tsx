/**
 * AcademyPage —— 青训学院
 *
 * - 查看学院等级 / 累计投入 / 上次产出年份
 * - 投入资金（影响新秀上限）
 * - 升级学院（提升新秀数量与潜力上限）
 * - 手动产出新秀（测试用，正常由赛季交接自动产出）
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchAcademy,
  postUpgradeAcademy,
  postInvestAcademy,
  postProduceRookies,
} from "../api";
import type { Academy } from "../types";

interface Props {
  teamId: string;
}

/** 每级升级费用（与后端常量对齐） */
const UPGRADE_COST = [0, 50_000, 120_000, 250_000, 500_000];
/** 每级新秀潜力上限 */
const LEVEL_POTENTIAL_CAP = [0, 70, 76, 82, 88, 94];
/** 每级新秀产出数量 */
const LEVEL_PROD_COUNT = [0, 1, 1, 2, 2, 3];
const MAX_LEVEL = 5;

/** 球探评级：基于潜力值 */
function scoutGrade(potential: number): { grade: string; color: string } {
  if (potential >= 90) return { grade: "S+ 未来超巨", color: "#ff4757" };
  if (potential >= 85) return { grade: "S 全明星潜质", color: "#ff6b81" };
  if (potential >= 80) return { grade: "A 优质首发", color: "#ffa502" };
  if (potential >= 75) return { grade: "B 可靠轮换", color: "#7bed9f" };
  if (potential >= 70) return { grade: "C 角色球员", color: "#70a1ff" };
  return { grade: "D 边缘球员", color: "#a4b0be" };
}

/** 位置中文名 */
const POSITION_CN: Record<string, string> = {
  PG: "控卫", SG: "分卫", SF: "小前", PF: "大前", C: "中锋",
};

export function AcademyPage({ teamId }: Props) {
  const [academy, setAcademy] = useState<Academy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [investAmount, setInvestAmount] = useState(10000);
  const [produceResult, setProduceResult] = useState<
    Array<{ playerId: string; name: string; position: string; potential: number; ovr: number }>
  >([]);

  const load = useCallback(() => {
    setLoading(true);
    fetchAcademy(teamId)
      .then(setAcademy)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpgrade() {
    setBusy(true);
    setError(null);
    try {
      const updated = await postUpgradeAcademy(teamId);
      setAcademy(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleInvest() {
    if (investAmount <= 0) {
      setError("投入金额必须大于 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await postInvestAcademy(teamId, investAmount);
      setAcademy(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleProduce() {
    setBusy(true);
    setError(null);
    setProduceResult([]);
    try {
      const { produced } = await postProduceRookies(teamId);
      setProduceResult(produced);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载青训学院…
      </div>
    );
  }

  if (!academy) {
    return <div className="state error">{error ?? "无法加载学院数据"}</div>;
  }

  const nextLevelCost = UPGRADE_COST[academy.level + 1] ?? null;
  const isMaxLevel = academy.level >= MAX_LEVEL;
  const canUpgrade = !isMaxLevel && nextLevelCost !== null && academy.investment >= nextLevelCost;

  return (
    <div className="page">
      <header className="page-head">
        <h2>青训学院</h2>
        <p className="muted">
          培养球队未来核心。每年休赛期自动产出新秀，等级与投入决定新秀潜力上限。
        </p>
      </header>

      {error && <div className="state error">{error}</div>}

      <div className="grid grid-2">
        <section className="card">
          <h3>学院状态</h3>
          <dl className="kv">
            <div>
              <dt>等级</dt>
              <dd>
                <span className="badge badge-big">{academy.level} / {MAX_LEVEL}</span>
              </dd>
            </div>
            <div>
              <dt>累计投入</dt>
              <dd>${academy.investment.toLocaleString()}</dd>
            </div>
            <div>
              <dt>新秀潜力上限</dt>
              <dd>{LEVEL_POTENTIAL_CAP[academy.level]}</dd>
            </div>
            <div>
              <dt>每年产出数量</dt>
              <dd>{LEVEL_PROD_COUNT[academy.level]} 名</dd>
            </div>
            <div>
              <dt>上次产出年份</dt>
              <dd>{academy.lastProdYear ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <h3>升级学院</h3>
          {isMaxLevel ? (
            <p className="muted">学院已满级，新秀潜力上限 {LEVEL_POTENTIAL_CAP[MAX_LEVEL]}。</p>
          ) : (
            <>
              <dl className="kv">
                <div>
                  <dt>下一级</dt>
                  <dd>等级 {academy.level + 1}</dd>
                </div>
                <div>
                  <dt>升级费用</dt>
                  <dd>${nextLevelCost?.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>升级后潜力上限</dt>
                  <dd>{LEVEL_POTENTIAL_CAP[academy.level + 1]}</dd>
                </div>
                <div>
                  <dt>升级后产出数量</dt>
                  <dd>{LEVEL_PROD_COUNT[academy.level + 1]} 名</dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canUpgrade || busy}
                onClick={handleUpgrade}
              >
                {canUpgrade ? "升级" : "投入不足"}
              </button>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h3>投入资金</h3>
        <p className="muted">投入资金用于升级学院。升级时一次性扣除对应金额。</p>
        <div className="row gap">
          <label className="field">
            <span>投入金额</span>
            <input
              type="number"
              min={1}
              step={1000}
              value={investAmount}
              onChange={(e) => setInvestAmount(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={handleInvest}
          >
            投入
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setInvestAmount(50000)}
          >
            +5万
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setInvestAmount(100000)}
          >
            +10万
          </button>
        </div>
      </section>

      <section className="card">
        <h3>产出新秀（测试）</h3>
        <p className="muted">
          正常情况下由赛季交接自动产出。此处可手动触发以验证逻辑（每年仅一次）。
        </p>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={handleProduce}
        >
          手动产出
        </button>

        {produceResult.length > 0 && (
          <div className="scout-reports">
            <h4>球探报告</h4>
            <div className="grid grid-2">
              {produceResult.map((p) => {
                const { grade, color } = scoutGrade(p.potential);
                const pct = Math.min(100, (p.potential / 99) * 100);
                return (
                  <div key={p.playerId} className="scout-card">
                    <div className="scout-head">
                      <strong>{p.name}</strong>
                      <span className="scout-position">{POSITION_CN[p.position] ?? p.position}</span>
                    </div>
                    <div className="scout-grade" style={{ color }}>
                      {grade}
                    </div>
                    <div className="scout-stats">
                      <div className="stat-row">
                        <span>当前 OVR</span>
                        <span className="stat-val">{p.ovr}</span>
                      </div>
                      <div className="stat-row">
                        <span>潜力上限</span>
                        <span className="stat-val">{p.potential}</span>
                      </div>
                    </div>
                    <div className="potential-bar">
                      <div
                        className="potential-fill"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                    <div className="scout-note muted">
                      {p.potential >= 85
                        ? "天赋异禀，建议重点培养，给予充足出场时间。"
                        : p.potential >= 75
                          ? "即战力尚可，通过训练可进一步提升。"
                          : "需大量训练投入，发展为角色球员。"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
