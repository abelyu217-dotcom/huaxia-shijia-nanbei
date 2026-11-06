/**
 * ContractPage —— 合同管理
 *
 * - 球队合同：查看阵容合同，执行续约 / 裁员
 * - 自由球员：浏览自由球员并签约
 * - 操作后自动刷新列表
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchTeamContracts,
  fetchFreeAgents,
  postExtendContract,
  postWaivePlayer,
  postSignFreeAgent,
} from "../api";
import type { Contract, FreeAgent } from "../types";

interface Props {
  teamId: string;
  worldId?: string;
}

/** 格式化金额 */
function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

/** 选项类型文案 */
function optionTypeLabel(c: Contract): string {
  const tags: string[] = [];
  if (c.playerOption) tags.push("球员选项");
  if (c.teamOption) tags.push("球队选项");
  if (c.noTrade) tags.push("不可交易");
  return tags.length ? tags.join("·") : "保障";
}

type Tab = "team" | "free";

export function ContractPage({ teamId, worldId }: Props) {
  const { user } = useAuth();
  const resolvedTeamId = teamId || user?.teamId || "";

  const [tab, setTab] = useState<Tab>("team");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 续约 / 签约表单状态
  const [extendFor, setExtendFor] = useState<string | null>(null);
  const [signFor, setSignFor] = useState<string | null>(null);
  const [years, setYears] = useState(2);
  const [salary, setSalary] = useState(5000000);

  const loadTeam = useCallback(async () => {
    if (!resolvedTeamId) return;
    try {
      const list = await fetchTeamContracts(resolvedTeamId, "active");
      setContracts(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [resolvedTeamId]);

  const loadFree = useCallback(async () => {
    try {
      const list = await fetchFreeAgents(worldId);
      setFreeAgents(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [worldId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadTeam(), loadFree()]).finally(() => setLoading(false));
  }, [loadTeam, loadFree]);

  const sortedContracts = useMemo(
    () => [...contracts].sort((a, b) => b.salaryPerYear - a.salaryPerYear),
    [contracts],
  );

  async function handleExtend(contractId: string) {
    setBusy(true);
    setError(null);
    try {
      await postExtendContract(contractId, {
        addYears: years,
        newSalaryPerYear: salary,
      });
      setExtendFor(null);
      await loadTeam();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleWaive(contractId: string) {
    if (!confirm("确认裁掉该球员？此操作不可撤销。")) return;
    setBusy(true);
    setError(null);
    try {
      await postWaivePlayer(contractId);
      await loadTeam();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignFree(playerId: string) {
    setBusy(true);
    setError(null);
    try {
      await postSignFreeAgent({
        playerId,
        teamId: resolvedTeamId,
        yearsTotal: years,
        salaryPerYear: salary,
      });
      setSignFor(null);
      await Promise.all([loadTeam(), loadFree()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载合同数据…
      </div>
    );
  }

  if (!resolvedTeamId) {
    return <div className="state error">未关联球队，无法管理合同</div>;
  }

  return (
    <div className="page contract-page">
      <header className="page-head">
        <h2>合同管理</h2>
        <p className="muted">
          管理球队阵容合同、续约裁员，以及在自由市场签约球员。
        </p>
      </header>

      {error && <div className="state error">{error}</div>}

      <div className="tabs">
        <button
          className={`tab ${tab === "team" ? "active" : ""}`}
          onClick={() => setTab("team")}
        >
          球队合同 ({sortedContracts.length})
        </button>
        <button
          className={`tab ${tab === "free" ? "active" : ""}`}
          onClick={() => setTab("free")}
        >
          自由球员 ({freeAgents.length})
        </button>
      </div>

      {/* ── 球队合同 ── */}
      {tab === "team" && (
        <section className="card">
          {sortedContracts.length === 0 ? (
            <p className="muted">暂无有效合同</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>球员</th>
                    <th>位置</th>
                    <th>年龄</th>
                    <th>年薪</th>
                    <th>年限（余/总）</th>
                    <th>选项</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedContracts.map((c) => (
                    <tr key={c.id}>
                      <td>{c.player?.name ?? c.playerId}</td>
                      <td className="pos">{c.player?.position ?? "—"}</td>
                      <td>{c.player?.age ?? "—"}</td>
                      <td className="num">{formatMoney(c.salaryPerYear)}</td>
                      <td>
                        {c.yearsRemain} / {c.yearsTotal}
                      </td>
                      <td>{optionTypeLabel(c)}</td>
                      <td>
                        {extendFor === c.id ? (
                          <div className="inline-form">
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={years}
                              onChange={(e) => setYears(Number(e.target.value))}
                              placeholder="续约年数"
                            />
                            <input
                              type="number"
                              min={0}
                              step={100000}
                              value={salary}
                              onChange={(e) => setSalary(Number(e.target.value))}
                              placeholder="新年薪"
                            />
                            <button
                              className="btn btn-primary"
                              disabled={busy}
                              onClick={() => handleExtend(c.id)}
                            >
                              确认
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() => setExtendFor(null)}
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="row-actions">
                            <button
                              className="btn btn-ghost"
                              onClick={() => {
                                setExtendFor(c.id);
                                setYears(2);
                                setSalary(c.salaryPerYear);
                              }}
                            >
                              续约
                            </button>
                            <button
                              className="btn"
                              onClick={() => handleWaive(c.id)}
                            >
                              裁员
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── 自由球员 ── */}
      {tab === "free" && (
        <section className="card">
          {freeAgents.length === 0 ? (
            <p className="muted">暂无自由球员</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>球员</th>
                    <th>位置</th>
                    <th>年龄</th>
                    <th>潜力</th>
                    <th>年薪要求</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {freeAgents.map((fa) => (
                    <tr key={fa.id}>
                      <td>{fa.name}</td>
                      <td className="pos">{fa.position}</td>
                      <td>{fa.age}</td>
                      <td>{fa.potential ?? "—"}</td>
                      <td className="num">{formatMoney(fa.salary)}</td>
                      <td>
                        {signFor === fa.id ? (
                          <div className="inline-form">
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={years}
                              onChange={(e) => setYears(Number(e.target.value))}
                              placeholder="合同年数"
                            />
                            <input
                              type="number"
                              min={0}
                              step={100000}
                              value={salary}
                              onChange={(e) => setSalary(Number(e.target.value))}
                              placeholder="年薪"
                            />
                            <button
                              className="btn btn-primary"
                              disabled={busy}
                              onClick={() => handleSignFree(fa.id)}
                            >
                              签约
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() => setSignFor(null)}
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              setSignFor(fa.id);
                              setYears(2);
                              setSalary(fa.salary);
                            }}
                          >
                            签约
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
