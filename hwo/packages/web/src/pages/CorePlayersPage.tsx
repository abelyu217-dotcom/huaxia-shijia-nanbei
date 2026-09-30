/**
 * CorePlayersPage —— 核心球员页
 *
 * 参考 Rim Attack 核心球员页：
 * - 调用 fetchTeam(teamId) 获取球队详情，筛选 OVR >= 75 的核心球员
 *   （不足则取 Top 5，按 OVR 降序）。
 * - 每张卡片展示：姓名 / 位置 / OVR（大号彩色数字）、队长与新秀标记、
 *   状态色、合同信息（年薪 / 剩余年限，来自 fetchTeamContracts）、
 *   职业生涯阶段（来自 fetchTeamCareers）、五维能力条形图（得分 / 篮板 /
 *   助攻 / 防守 / 速度，由 Abilities 近似投影，替代雷达图）。
 * - 续约：弹出内联表单输入年限与薪资，调用 postExtendContract。
 * - 交易：提示前往交易页。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchTeam,
  fetchTeamContracts,
  fetchTeamCareers,
  postExtendContract,
} from "../api";
import { POSITION_LABEL, ovrVal, abilityVal } from "../lib";
import type {
  Abilities,
  CareerStage,
  Contract,
  FogValue,
  PlayerCareer,
  PlayerDetail,
  TeamDetail,
} from "../types";

interface Props {
  teamId?: string;
}

/** 状态色 —— 复用 TeamPage 的状态体系 */
const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  peak: { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "巅峰" },
  good: { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", label: "良好" },
  tired: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "疲劳" },
  exhausted: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "力竭" },
};

/** 职业生涯阶段文案与徽章色（复用 CareerPage 的 badge-* 色） */
const CAREER_STAGE_LABEL: Record<CareerStage, string> = {
  rookie: "新秀",
  rising: "上升期",
  prime: "巅峰期",
  decline: "下滑期",
  retired: "退役",
};

const CAREER_STAGE_BADGE: Record<CareerStage, string> = {
  rookie: "badge-new",
  rising: "badge-rise",
  prime: "badge-prime",
  decline: "badge-fall",
  retired: "badge-retire",
};

/** OVR 数字配色 —— 参考 TeamPage 的 ovrColor */
function ovrColor(ovr: number): string {
  if (ovr >= 85) return "var(--gold)";
  if (ovr >= 80) return "var(--purple)";
  if (ovr >= 75) return "#a78bfa";
  if (ovr >= 70) return "#60a5fa";
  if (ovr >= 65) return "#34d399";
  return "var(--text-muted)";
}

/** OVR 等级分档，用于卡片配色 */
function ovrTierClass(ovr: number): string {
  if (ovr >= 85) return "gold";
  if (ovr >= 80) return "purple";
  if (ovr >= 75) return "blue";
  return "gray";
}

interface AbilityRow {
  key: string;
  label: string;
  val: number;
}

/**
 * 由 Abilities 近似投影为 5 维能力（0-99），替代雷达图：
 * - 得分：(三分 + 中投 + 内线 + 突破) / 4
 * - 篮板：(内线 + 弹跳 + 内防) / 3（无独立篮板值，以内线拼抢近似）
 * - 助攻：传球
 * - 防守：(外防 + 内防 + 抢断 + 盖帽) / 4
 * - 速度：速度
 *
 * 支持 The Fog：对手球员的 abilities 可能为带雾估值（FogValue），
 * 统一用 abilityVal 提取数值。
 */
function deriveAbilities(
  a: Abilities | Partial<Record<keyof Abilities, FogValue>>,
): AbilityRow[] {
  const scoring = Math.round(
    (abilityVal(a.three) + abilityVal(a.midrange) + abilityVal(a.inside) + abilityVal(a.drive)) / 4,
  );
  const rebound = Math.round(
    (abilityVal(a.inside) + abilityVal(a.jumping) + abilityVal(a.interiorD)) / 3,
  );
  const assist = abilityVal(a.passing);
  const defense = Math.round(
    (abilityVal(a.perimeterD) + abilityVal(a.interiorD) + abilityVal(a.steal) + abilityVal(a.block)) / 4,
  );
  const speed = abilityVal(a.speed);
  return [
    { key: "scoring", label: "得分", val: scoring },
    { key: "rebound", label: "篮板", val: rebound },
    { key: "assist", label: "助攻", val: assist },
    { key: "defense", label: "防守", val: defense },
    { key: "speed", label: "速度", val: speed },
  ];
}

/** 格式化金额：千分位 + $ 前缀 */
function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

interface ExtendTarget {
  playerId: string;
  contractId: string;
  name: string;
}

export function CorePlayersPage({ teamId: propTeamId }: Props) {
  const { user } = useAuth();
  const teamId = propTeamId ?? user?.teamId ?? undefined;

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [careers, setCareers] = useState<PlayerCareer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 续约弹窗状态
  const [extendTarget, setExtendTarget] = useState<ExtendTarget | null>(null);
  const [extendYears, setExtendYears] = useState(2);
  const [extendSalary, setExtendSalary] = useState(1000);
  const [extendBusy, setExtendBusy] = useState(false);

  // 交易提示（按球员 id 跟踪）
  const [tradeHintId, setTradeHintId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTeam(teamId),
      fetchTeamContracts(teamId),
      fetchTeamCareers(teamId),
    ])
      .then(([t, c, cr]) => {
        setTeam(t);
        setContracts(c);
        setCareers(cr);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  // 核心球员：OVR >= 75；不足则取 Top 5
  const corePlayers = useMemo(() => {
    if (!team) return [];
    const sorted = [...team.players].sort((a, b) => ovrVal(b.ovr) - ovrVal(a.ovr));
    const ge75 = sorted.filter((p) => ovrVal(p.ovr) >= 75);
    return ge75.length > 0 ? ge75 : sorted.slice(0, 5);
  }, [team]);

  const contractByPlayer = useMemo(() => {
    const map = new Map<string, Contract>();
    for (const c of contracts) {
      if (c.status === "active" && !map.has(c.playerId)) {
        map.set(c.playerId, c);
      }
    }
    return map;
  }, [contracts]);

  const careerByPlayer = useMemo(() => {
    const map = new Map<string, PlayerCareer>();
    for (const c of careers) map.set(c.playerId, c);
    return map;
  }, [careers]);

  const isMine = !!teamId && user?.teamId === teamId;

  function handleOpenExtend(p: PlayerDetail) {
    const c = contractByPlayer.get(p.id);
    if (!c) {
      setNotice(`${p.name} 暂无合同记录，无法续约`);
      return;
    }
    setNotice(null);
    setExtendTarget({ playerId: p.id, contractId: c.id, name: p.name });
    setExtendYears(c.yearsRemain > 0 ? c.yearsRemain : 2);
    setExtendSalary(c.salaryPerYear || p.salary || 1000);
  }

  async function handleSubmitExtend() {
    if (!extendTarget) return;
    setExtendBusy(true);
    setError(null);
    try {
      await postExtendContract(extendTarget.contractId, {
        addYears: extendYears,
        newSalaryPerYear: extendSalary,
      });
      setNotice(
        `✓ 已为 ${extendTarget.name} 续约 ${extendYears} 年，年薪 ${formatMoney(
          extendSalary,
        )}`,
      );
      setExtendTarget(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtendBusy(false);
    }
  }

  function handleTrade(p: PlayerDetail) {
    setTradeHintId(p.id);
    window.setTimeout(
      () => setTradeHintId((cur) => (cur === p.id ? null : cur)),
      3000,
    );
  }

  if (!teamId) {
    return (
      <div className="state">尚未绑定球队，无法查看核心球员。</div>
    );
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载核心球员…
      </div>
    );
  }

  if (!team) {
    return (
      <div className="state">
        {error ? `核心球员加载失败：${error}` : "暂无球队数据。"}
      </div>
    );
  }

  return (
    <div className="core-players-page">
      <header className="page-head">
        <h2>
          核心球员 · {team.name}
        </h2>
        <p className="muted">
          OVR ≥ 75 的球员为球队核心（不足则取 Top 5）。展示五维能力、合同与生涯阶段，支持续约与交易操作。
        </p>
      </header>

      {error && <div className="state error">{error}</div>}
      {notice && <div className="state success">{notice}</div>}

      {corePlayers.length === 0 ? (
        <div className="card">
          <p className="muted">球队暂无球员数据。</p>
        </div>
      ) : (
        <div className="core-player-grid">
          {corePlayers.map((p) => {
            const contract = contractByPlayer.get(p.id);
            const career = careerByPlayer.get(p.id);
            const abilities = deriveAbilities(p.abilities);
            const st = STATUS_STYLE[p.status ?? "good"];
            const isRookie =
              p.isRookie || (career?.age != null && career.age <= 21);
            const pOvr = ovrVal(p.ovr);
            return (
              <article
                key={p.id}
                className={`core-player-card tier-${ovrTierClass(pOvr)}`}
              >
                {/* 头部：OVR + 姓名 / 位置 / 标记 */}
                <div className="cpc-head">
                  <div
                    className="cpc-ovr"
                    style={{ color: ovrColor(pOvr) }}
                    aria-label={`综合评分 ${pOvr}`}
                  >
                    {pOvr}
                  </div>
                  <div className="cpc-id">
                    <div className="cpc-name-row">
                      <span className="cpc-pos">{p.position}</span>
                      <span className="cpc-name" title={p.name}>
                        {p.name}
                      </span>
                      <span className="muted cpc-pos-label">
                        {POSITION_LABEL[p.position]}
                      </span>
                    </div>
                    <div className="cpc-tags">
                      {p.isCaptain && (
                        <span className="tag tag-captain" title="队长">
                          C
                        </span>
                      )}
                      {isRookie && (
                        <span className="tag tag-rookie" title="新秀">
                          新秀
                        </span>
                      )}
                      <span
                        className="chip status-chip"
                        style={{
                          color: st.color,
                          background: st.bg,
                          borderColor: st.bg,
                        }}
                      >
                        {st.label}
                      </span>
                      {career && (
                        <span
                          className={`cpc-stage ${CAREER_STAGE_BADGE[career.stage]}`}
                          title={career.stageLabel}
                        >
                          {CAREER_STAGE_LABEL[career.stage]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 能力五维条形图（替代雷达图） */}
                <div className="ability-bars">
                  {abilities.map((ab) => (
                    <div className="ab-row" key={ab.key}>
                      <span className="ab-label">{ab.label}</span>
                      <div className="ab-track">
                        <div
                          className="ab-fill"
                          style={{
                            width: `${Math.max(0, Math.min(99, ab.val))}%`,
                            background: ovrColor(ab.val),
                          }}
                        />
                      </div>
                      <span className="ab-val">{ab.val}</span>
                    </div>
                  ))}
                </div>

                {/* 合同信息 */}
                <div className="cpc-contract">
                  {contract ? (
                    <>
                      <div className="cpc-contract-row">
                        <span className="muted">年薪</span>
                        <strong>{formatMoney(contract.salaryPerYear)}</strong>
                      </div>
                      <div className="cpc-contract-row">
                        <span className="muted">剩余年限</span>
                        <strong>
                          {contract.yearsRemain} / {contract.yearsTotal} 年
                        </strong>
                      </div>
                    </>
                  ) : (
                    <span className="muted">暂无合同记录</span>
                  )}
                </div>

                {/* 生涯附加信息 */}
                {career && (
                  <div className="cpc-career">
                    <span className="muted">年龄 {career.age}</span>
                    <span className="muted">潜力 {career.potential}</span>
                    <span className="muted">
                      成长空间 {career.growthRoom > 0 ? `+${career.growthRoom}` : "—"}
                    </span>
                  </div>
                )}

                {/* 续约 / 交易操作 */}
                <div className="cpc-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={!isMine || !contract}
                    onClick={() => handleOpenExtend(p)}
                  >
                    续约
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={!isMine}
                    onClick={() => handleTrade(p)}
                  >
                    交易
                  </button>
                  {tradeHintId === p.id && (
                    <span className="trade-hint">请前往「交易」页发起交易</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 续约弹窗 */}
      {extendTarget && (
        <div
          className="cp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`续约 ${extendTarget.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !extendBusy) {
              setExtendTarget(null);
            }
          }}
        >
          <div className="cp-modal">
            <h3>续约 · {extendTarget.name}</h3>
            <label className="cp-field">
              <span>续约年限（年）</span>
              <input
                type="number"
                min={1}
                max={6}
                value={extendYears}
                onChange={(e) =>
                  setExtendYears(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </label>
            <label className="cp-field">
              <span>新年薪（万）</span>
              <input
                type="number"
                min={1}
                value={extendSalary}
                onChange={(e) =>
                  setExtendSalary(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </label>
            <div className="cp-modal-actions">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setExtendTarget(null)}
                disabled={extendBusy}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleSubmitExtend}
                disabled={extendBusy}
              >
                {extendBusy ? "提交中…" : "确认续约"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
