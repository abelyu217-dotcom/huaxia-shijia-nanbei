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
  fetchTeamDynasty,
  fetchPlayerNetwork,
  fetchPlayerMorale,
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
  PlayerProfile,
  TeamDetail,
  TeamDynastyView,
  PlayerNetworkView,
  PlayerMoraleView,
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
  // v0.6 §批次6: 王朝 + 关系网
  const [dynasty, setDynasty] = useState<TeamDynastyView | null>(null);
  const [networks, setNetworks] = useState<Record<string, PlayerNetworkView>>({});
  const [morales, setMorales] = useState<Record<string, PlayerMoraleView>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 卡内视图切换：能力 / 档案
  const [cardView, setCardView] = useState<Record<string, "ability" | "profile">>({});
  // 展开关系网（按球员 id 跟踪）
  const [relExpandedId, setRelExpandedId] = useState<string | null>(null);

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
      fetchTeamDynasty(teamId).catch(() => null),
    ])
      .then(([t, c, cr, d]) => {
        setTeam(t);
        setContracts(c);
        setCareers(cr);
        setDynasty(d);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  // 拉取核心球员的关系网与士气（按需加载，失败静默）
  const loadPlayerRel = useCallback((playerId: string) => {
    Promise.all([
      fetchPlayerNetwork(playerId).catch(() => null),
      fetchPlayerMorale(playerId).catch(() => null),
    ]).then(([n, m]) => {
      setNetworks((prev) => (n ? { ...prev, [playerId]: n } : prev));
      setMorales((prev) => (m ? { ...prev, [playerId]: m } : prev));
    });
  }, []);

  // 核心球员：OVR >= 75；不足则取 Top 5
  const corePlayers = useMemo(() => {
    if (!team) return [];
    const sorted = [...team.players].sort((a, b) => ovrVal(b.ovr) - ovrVal(a.ovr));
    const ge75 = sorted.filter((p) => ovrVal(p.ovr) >= 75);
    return ge75.length > 0 ? ge75 : sorted.slice(0, 5);
  }, [team]);

  // 核心球员变化后预拉取关系网摘要
  useEffect(() => {
    if (corePlayers.length === 0) return;
    corePlayers.forEach((p) => {
      if (!networks[p.id] && relExpandedId !== p.id) {
        void loadPlayerRel(p.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corePlayers.map((p) => p.id).join(",")]);

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
          OVR ≥ 75 的球员为球队核心（不足则取 Top 5）。展示五维能力、38 项档案、王朝标签、关系网与合同信息，支持续约与交易操作。
        </p>
      </header>

      {error && <div className="state error">{error}</div>}
      {notice && <div className="state success">{notice}</div>}

      {/* 王朝标签横幅（v0.6 §批次6） */}
      {dynasty && (dynasty.activeDynasty || dynasty.records.length > 0) && (
        <DynastyBanner dynasty={dynasty} />
      )}

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
            const view = cardView[p.id] ?? "ability";
            const net = networks[p.id];
            const morale = morales[p.id];
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
                      {/* 关系网摘要 chip */}
                      {net && (
                        <span
                          className="cpc-rel-chip"
                          title="关系网摘要（点击下方展开）"
                        >
                          关系 {relSummaryCount(net)}
                        </span>
                      )}
                      {morale && (
                        <span
                          className="cpc-morale-chip"
                          style={{ color: moraleColor(morale.morale) }}
                          title="球员士气"
                        >
                          士气 {morale.morale}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 卡内视图切换：能力 / 档案 */}
                <div className="cpc-view-toggle">
                  <button
                    type="button"
                    className={`cpc-toggle-btn${view === "ability" ? " is-active" : ""}`}
                    onClick={() =>
                      setCardView((prev) => ({ ...prev, [p.id]: "ability" }))
                    }
                  >
                    五维能力
                  </button>
                  <button
                    type="button"
                    className={`cpc-toggle-btn${view === "profile" ? " is-active" : ""}`}
                    onClick={() =>
                      setCardView((prev) => ({ ...prev, [p.id]: "profile" }))
                    }
                    disabled={!p.profile}
                    title={p.profile ? "查看 38 项档案" : "该球员暂无档案数据"}
                  >
                    38 项档案
                  </button>
                </div>

                {/* 能力五维条形图 或 38 项档案 */}
                {view === "profile" && p.profile ? (
                  <PlayerProfilePanel profile={p.profile} />
                ) : (
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
                    {!p.profile && (
                      <div className="cpc-profile-empty muted">
                        该球员暂无 38 项档案数据
                      </div>
                    )}
                  </div>
                )}

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

                {/* 关系网（可展开） */}
                {net && (
                  <RelationshipSummary
                    network={net}
                    expanded={relExpandedId === p.id}
                    onToggle={() =>
                      setRelExpandedId((cur) =>
                        cur === p.id ? null : p.id,
                      )
                    }
                  />
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

// ── v0.6 §批次6: 王朝 / 关系网 / 38 项档案 辅助组件 ──

/** 士气颜色：高绿、中黄、低红 */
function moraleColor(v: number): string {
  if (v > 70) return "#22c55e";
  if (v >= 50) return "#f59e0b";
  return "#ef4444";
}

/** 关系总数（不分类型） */
function relSummaryCount(net: PlayerNetworkView): number {
  return Object.values(net.relationships).reduce(
    (sum, edges) => sum + edges.length,
    0,
  );
}

/** 王朝等级配色 */
const DYNASTY_TIER_STYLE: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  legendary: { color: "#fbbf24", bg: "rgba(251,191,36,0.15)", label: "传奇" },
  golden: { color: "#f59e0b", bg: "rgba(245,158,11,0.15)", label: "黄金" },
  silver: { color: "#94a3b8", bg: "rgba(148,163,184,0.15)", label: "白银" },
  rising: { color: "#60a5fa", bg: "rgba(96,165,250,0.15)", label: "崛起" },
};

function dynastyTierStyle(tier: string): {
  color: string;
  bg: string;
  label: string;
} {
  return DYNASTY_TIER_STYLE[tier] ?? {
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
    label: tier,
  };
}

/** 王朝标签横幅 */
function DynastyBanner({ dynasty }: { dynasty: TeamDynastyView }) {
  const active = dynasty.activeDynasty;
  const recent = dynasty.records.slice(0, 3);
  return (
    <section className="cpc-dynasty-banner">
      <div className="cpc-dynasty-head">
        <h3>王朝标签</h3>
        <span className="cpc-dynasty-total muted">
          累计传承分 {dynasty.totalLegacyScore.toLocaleString()}
        </span>
      </div>
      {active && (
        <div
          className="cpc-dynasty-active"
          style={{
            color: dynastyTierStyle(active.tier).color,
            background: dynastyTierStyle(active.tier).bg,
          }}
        >
          <span className="cpc-dynasty-tier">
            {dynastyTierStyle(active.tier).label}
          </span>
          <span className="cpc-dynasty-titles">
            {active.titles} 冠 · {active.legacyScore.toLocaleString()} 分
          </span>
        </div>
      )}
      {recent.length > 0 && (
        <div className="cpc-dynasty-list">
          {recent.map((r) => {
            const ds = dynastyTierStyle(r.tier);
            return (
              <div key={r.id} className="cpc-dynasty-item">
                <span
                  className="cpc-dynasty-tag"
                  style={{ color: ds.color, background: ds.bg }}
                >
                  {ds.label}
                </span>
                <span className="cpc-dynasty-meta muted">
                  第 {r.startSeason}
                  {r.endSeason ? `–${r.endSeason}` : "–"} 赛季 · {r.titles} 冠 ·{" "}
                  {r.runnerUps} 亚
                </span>
                {r.signatureTags.length > 0 && (
                  <span className="cpc-dynasty-sig">
                    {r.signatureTags.join(" · ")}
                  </span>
                )}
                {r.active && <span className="cpc-dynasty-live">进行中</span>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── 38 项档案面板 ──

const ATHLETIC_LABELS: { key: string; label: string }[] = [
  { key: "speed", label: "速度" },
  { key: "vertical", label: "弹跳" },
  { key: "strength", label: "力量" },
  { key: "agility", label: "敏捷" },
  { key: "stamina", label: "耐力" },
  { key: "lateral", label: "横向移动" },
  { key: "burst", label: "垂直爆发" },
  { key: "flexibility", label: "柔韧性" },
];

const SKILL_LABELS: { key: string; label: string }[] = [
  { key: "three", label: "三分" },
  { key: "midrange", label: "中投" },
  { key: "freeThrow", label: "罚球" },
  { key: "layup", label: "上篮" },
  { key: "dunk", label: "扣篮" },
  { key: "passing", label: "传球" },
  { key: "ballHandle", label: "控球" },
  { key: "rebounding", label: "篮板" },
  { key: "steal", label: "抢断" },
  { key: "block", label: "盖帽" },
  { key: "postUp", label: "低位" },
  { key: "faceUp", label: "面框" },
  { key: "pickRoll", label: "挡拆" },
  { key: "backToBasket", label: "背身" },
];

const MENTAL_LABELS: { key: string; label: string; max: number }[] = [
  { key: "workEthic", label: "敬业度", max: 10 },
  { key: "pressure", label: "抗压", max: 10 },
  { key: "teamwork", label: "团队", max: 10 },
  { key: "leadership", label: "领导力", max: 10 },
  { key: "iq", label: "篮球智商", max: 99 },
];

const RELATIONSHIP_LABEL: Record<string, string> = {
  family: "家人",
  teammate: "队友",
  mentor: "师徒",
  rival: "宿敌",
  friend: "朋友",
  external: "外部",
};

const RELATIONSHIP_COLOR: Record<string, string> = {
  family: "#f472b6",
  teammate: "#4ade80",
  mentor: "#a78bfa",
  rival: "#ef4444",
  friend: "#60a5fa",
  external: "#94a3b8",
};

function bondColor(bond: number): string {
  if (bond >= 75) return "#4ade80";
  if (bond >= 50) return "#fbbf24";
  if (bond >= 25) return "#fb923c";
  return "#ef4444";
}

/** 38 项档案面板（physical 7 + athletic 8 + skill 14 + mental 5 + hidden 4） */
function PlayerProfilePanel({ profile }: { profile: PlayerProfile }) {
  const { physical, athletic, skill, mental, hidden } = profile;
  return (
    <div className="cpc-profile">
      {/* 静态体测 7 项 */}
      <div className="cpc-profile-group">
        <div className="cpc-profile-title">静态体测 (7)</div>
        <div className="cpc-profile-rows">
          <div className="cpc-profile-row">
            <span className="cpc-profile-label">身高</span>
            <span className="cpc-profile-val">{physical.heightCm} cm</span>
          </div>
          <div className="cpc-profile-row">
            <span className="cpc-profile-label">臂展</span>
            <span className="cpc-profile-val">{physical.armSpanCm} cm</span>
          </div>
          <div className="cpc-profile-row">
            <span className="cpc-profile-label">站立摸高</span>
            <span className="cpc-profile-val">
              {physical.standingReachCm} cm
            </span>
          </div>
          <div className="cpc-profile-row">
            <span className="cpc-profile-label">体重</span>
            <span className="cpc-profile-val">{physical.weightKg} kg</span>
          </div>
          <ProfileBar
            label="骨架"
            val={physical.frame}
            max={10}
          />
          <ProfileBar
            label="手长"
            val={physical.handLength}
            max={10}
          />
          <ProfileBar
            label="跟腱"
            val={physical.achilles}
            max={10}
          />
        </div>
      </div>

      {/* 动态运动 8 项 */}
      <div className="cpc-profile-group">
        <div className="cpc-profile-title">运动属性 (8)</div>
        <div className="cpc-profile-rows">
          {ATHLETIC_LABELS.map((a) => (
            <ProfileBar
              key={a.key}
              label={a.label}
              val={(athletic as unknown as Record<string, number>)[a.key]}
              max={99}
            />
          ))}
        </div>
      </div>

      {/* 技术属性 14 项 */}
      <div className="cpc-profile-group">
        <div className="cpc-profile-title">技术属性 (14)</div>
        <div className="cpc-profile-rows">
          {SKILL_LABELS.map((a) => (
            <ProfileBar
              key={a.key}
              label={a.label}
              val={(skill as unknown as Record<string, number>)[a.key]}
              max={99}
            />
          ))}
        </div>
      </div>

      {/* 心智属性 5 项 */}
      <div className="cpc-profile-group">
        <div className="cpc-profile-title">心智属性 (5)</div>
        <div className="cpc-profile-rows">
          {MENTAL_LABELS.map((a) => (
            <ProfileBar
              key={a.key}
              label={a.label}
              val={(mental as unknown as Record<string, number>)[a.key]}
              max={a.max}
            />
          ))}
        </div>
      </div>

      {/* 隐藏属性 4 项 */}
      <div className="cpc-profile-group">
        <div className="cpc-profile-title">隐藏属性 (4)</div>
        <div className="cpc-profile-rows">
          <ProfileBar
            label="伤病倾向"
            val={hidden.injuryProne}
            max={10}
            inverse
          />
          <div className="cpc-profile-row">
            <span className="cpc-profile-label">成长潜力</span>
            <span className="cpc-profile-val cpc-profile-tier">
              {hidden.potential}
            </span>
          </div>
          <div className="cpc-profile-row">
            <span className="cpc-profile-label">性格特质</span>
            <span className="cpc-profile-val">{hidden.personality || "—"}</span>
          </div>
          <ProfileBar
            label="忠诚度"
            val={hidden.loyalty}
            max={10}
          />
        </div>
      </div>
    </div>
  );
}

function ProfileBar({
  label,
  val,
  max,
  inverse = false,
}: {
  label: string;
  val?: number;
  max: number;
  inverse?: boolean;
}) {
  const v = typeof val === "number" ? val : 0;
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  // inverse：值越低越好（如伤病倾向）→ 反转颜色
  const colorVal = inverse ? max - v : v;
  const color =
    colorVal >= max * 0.75
      ? "#22c55e"
      : colorVal >= max * 0.5
        ? "#fbbf24"
        : "#ef4444";
  return (
    <div className="cpc-profile-row">
      <span className="cpc-profile-label">{label}</span>
      <div className="cpc-profile-bar">
        <div
          className="cpc-profile-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="cpc-profile-num">{v}</span>
    </div>
  );
}

/** 关系网摘要（可展开为完整列表） */
function RelationshipSummary({
  network,
  expanded,
  onToggle,
}: {
  network: PlayerNetworkView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const groups = Object.entries(network.relationships);
  const total = groups.reduce((s, [, edges]) => s + edges.length, 0);
  return (
    <div className="cpc-rel">
      <button
        type="button"
        className="cpc-rel-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="cpc-rel-title">关系网</span>
        <span className="cpc-rel-count">{total}</span>
        <span className="cpc-rel-arrow">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="cpc-rel-body">
          {/* 家庭背景 */}
          {network.family && (
            <div className="cpc-rel-family">
              <span className="cpc-rel-section-title">家庭</span>
              <span className="muted">
                {network.family.backgroundLabel}
                {network.family.members.length > 0 &&
                  ` · ${network.family.members.length} 名成员`}
              </span>
            </div>
          )}
          {/* 关系分组 */}
          {groups.length === 0 ? (
            <div className="cpc-rel-empty muted">暂无人际关系记录</div>
          ) : (
            groups.map(([type, edges]) => (
              <div key={type} className="cpc-rel-group">
                <div
                  className="cpc-rel-group-title"
                  style={{ color: RELATIONSHIP_COLOR[type] ?? "#94a3b8" }}
                >
                  {RELATIONSHIP_LABEL[type] ?? type}（{edges.length}）
                </div>
                <div className="cpc-rel-edges">
                  {edges.slice(0, 5).map((e) => (
                    <div key={e.id} className="cpc-rel-edge">
                      <span className="cpc-rel-edge-name">
                        {e.otherPlayerName}
                      </span>
                      <span
                        className="cpc-rel-edge-bond"
                        style={{ color: bondColor(e.bond) }}
                      >
                        {e.bond}
                      </span>
                      <span className="cpc-rel-edge-dir muted">
                        {e.direction === "out" ? "→" : "←"}
                      </span>
                    </div>
                  ))}
                  {edges.length > 5 && (
                    <span className="cpc-rel-more muted">
                      +{edges.length - 5} 条
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
