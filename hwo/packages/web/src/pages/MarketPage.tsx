/**
 * MarketPage —— 人才市场页（v0.6 §批次6）
 *
 * 数据源：
 *   - fetchMarketOverview() → MarketOverviewView
 *     含：阶段 / 自由球员 / 自由职员 / 本队待入队签约
 *
 * 布局：
 *   1. 市场阶段横幅（closed / free_agency / restricted）
 *   2. 标签切换：球员 / 主教练 / 助教 / 训练师 / 球探 / 经纪人 / 商人 / 记者 / 解说 / 裁判 / 工会代表
 *   3. 左主区：当前标签下的自由球员/职员列表（含签约按钮）
 *   4. 右副区：本队待入队签约列表（受限市场期间显示，可撤回）
 *
 * 阶段说明：
 *   - free_agency：签约立即入队
 *   - restricted：签约进入"待入队"，赛季末统一入队
 *   - closed：市场关闭，无法签约
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchMarketOverview,
  postSignFreeAgentPlayer,
  postSignFreeAgentStaff,
  postCancelPendingSigning,
} from "../api";
import type {
  FreeAgentPlayerView,
  FreeAgentStaffView,
  MarketOverviewView,
  PendingSigningView,
} from "../types";

interface Props {
  teamId?: string;
}

type Tab =
  | "player"
  | "head_coach"
  | "asst_coach"
  | "trainer"
  | "scout"
  | "agent"
  | "merchant"
  | "reporter"
  | "caster"
  | "arbiter"
  | "union_rep";

const TABS: { id: Tab; label: string }[] = [
  { id: "player", label: "自由球员" },
  { id: "head_coach", label: "主教练" },
  { id: "asst_coach", label: "助理教练" },
  { id: "trainer", label: "训练师" },
  { id: "scout", label: "球探" },
  { id: "agent", label: "经纪人" },
  { id: "merchant", label: "商人" },
  { id: "reporter", label: "记者" },
  { id: "caster", label: "解说" },
  { id: "arbiter", label: "裁判" },
  { id: "union_rep", label: "工会代表" },
];

const PHASE_META: Record<
  string,
  { label: string; bannerClass: string; hint: string }
> = {
  closed: {
    label: "市场关闭",
    bannerClass: "is-closed",
    hint: "市场已关闭，无法签约。",
  },
  free_agency: {
    label: "自由市场",
    bannerClass: "is-free",
    hint: "签约立即入队。",
  },
  restricted: {
    label: "受限市场",
    bannerClass: "is-restricted",
    hint: "签约进入待入队列表，赛季末统一入队。",
  },
};

function formatMoney(n: number): string {
  return `${n.toLocaleString()} 元`;
}

/** 状态标签 */
function statusLabel(s: string): { text: string; cls: string } {
  if (s === "claimed") return { text: "已预定", cls: "is-claimed" };
  if (s === "restricted") return { text: "受限", cls: "is-restricted" };
  return { text: "自由", cls: "is-free" };
}

export function MarketPage({ teamId: propTeamId }: Props) {
  const { user } = useAuth();
  const teamId = propTeamId ?? user?.teamId ?? undefined;

  const [overview, setOverview] = useState<MarketOverviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("player");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMarketOverview();
      setOverview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const phase = overview?.phase;
  const phaseInfo = phase ? PHASE_META[phase.phase] ?? PHASE_META.closed : PHASE_META.closed;
  const canSign = phase?.phase === "free_agency" || phase?.phase === "restricted";

  // 当前标签下的数据
  const players = overview?.freeAgentPlayers ?? [];
  const staff = overview?.freeAgentStaff ?? [];
  const pendings = overview?.pendingSignings ?? [];

  const filteredStaff = useMemo(() => {
    if (tab === "player") return [];
    return staff.filter((s) => s.job === tab);
  }, [staff, tab]);

  async function handleSignPlayer(p: FreeAgentPlayerView) {
    if (!teamId) return;
    setBusy(p.id);
    setNotice(null);
    try {
      const r = await postSignFreeAgentPlayer(p.id);
      setNotice(
        r.status === "joined"
          ? `✓ ${p.name} 已加入球队`
          : `✓ ${p.name} 已加入待入队列表（赛季末统一入队）`,
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleSignStaff(s: FreeAgentStaffView) {
    if (!teamId) return;
    setBusy(s.id);
    setNotice(null);
    try {
      const r = await postSignFreeAgentStaff(s.id);
      setNotice(
        r.status === "joined"
          ? `✓ ${s.name}（${s.jobLabel}）已加入球队`
          : `✓ ${s.name}（${s.jobLabel}）已加入待入队列表`,
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelPending(p: PendingSigningView) {
    setBusy(p.id);
    setNotice(null);
    try {
      await postCancelPendingSigning(p.id);
      setNotice(`✓ 已撤回 ${p.targetName} 的签约（退费 ${formatMoney(p.cost)}）`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!teamId) {
    return <div className="state">尚未绑定球队，无法查看人才市场。</div>;
  }

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载人才市场…
      </div>
    );
  }

  return (
    <div className="market-page">
      <header className="page-head">
        <h2>人才市场</h2>
        <p className="muted">
          自由球员与各类职员市场。自由市场期间签约立即入队；受限市场期间签约进入待入队列表，赛季末统一入队。
        </p>
      </header>

      {error && <div className="state error">{error}</div>}
      {notice && <div className="state success">{notice}</div>}

      {/* 市场阶段横幅 */}
      {phase && (
        <div className={`market-phase-banner ${phaseInfo.bannerClass}`}>
          <div>
            <div className="market-phase-label">{phaseInfo.label}</div>
            <div className="market-phase-meta">
              {phase.freeAgencyEndDay != null && (
                <span>自由市场截止：第 {phase.freeAgencyEndDay} 日 · </span>
              )}
              {phase.restrictedStartDay != null && (
                <span>受限市场开始：第 {phase.restrictedStartDay} 日 · </span>
              )}
              {phase.restrictedEndDay != null && (
                <span>受限市场结束：第 {phase.restrictedEndDay} 日</span>
              )}
              <span> · {phaseInfo.hint}</span>
            </div>
          </div>
          <span className="market-phase-tag">{phaseInfo.label}</span>
        </div>
      )}

      {/* 标签导航 */}
      <div className="tab-nav market-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="market-grid">
        {/* 左：自由球员/职员列表 */}
        <section className="card market-main">
          {tab === "player" ? (
            <PlayerMarketTable
              players={players}
              canSign={canSign}
              busy={busy}
              onSign={handleSignPlayer}
            />
          ) : (
            <StaffMarketTable
              staff={filteredStaff}
              canSign={canSign}
              busy={busy}
              onSign={handleSignStaff}
            />
          )}
        </section>

        {/* 右：待入队签约列表 */}
        <aside className="card market-aside">
          <h3>待入队签约 ({pendings.length})</h3>
          {pendings.length === 0 ? (
            <div className="empty-block muted">暂无待入队签约</div>
          ) : (
            <div className="market-pending-list">
              {pendings.map((p) => (
                <div key={p.id} className="market-pending-item">
                  <div className="market-pending-main">
                    <span className="market-pending-target">
                      {p.targetName}
                    </span>
                    <span className="market-pending-meta">
                      {p.targetType} · 第 {p.day} 日 · {formatMoney(p.cost)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost market-action-btn"
                    disabled={busy === p.id}
                    onClick={() => handleCancelPending(p)}
                  >
                    {busy === p.id ? "处理中…" : "撤回"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── 球员市场表格 ──

function PlayerMarketTable({
  players,
  canSign,
  busy,
  onSign,
}: {
  players: FreeAgentPlayerView[];
  canSign: boolean;
  busy: string | null;
  onSign: (p: FreeAgentPlayerView) => void;
}) {
  if (players.length === 0) {
    return <div className="empty-block muted">暂无自由球员</div>;
  }
  return (
    <div className="market-table">
      <div className="market-row market-row-head">
        <span>球员</span>
        <span>位置</span>
        <span>年龄</span>
        <span>OVR</span>
        <span>年薪</span>
        <span>状态</span>
        <span>操作</span>
      </div>
      {players.map((p) => {
        const st = statusLabel(p.status);
        return (
          <div key={p.id} className="market-row">
            <span className="market-cell-name">{p.name}</span>
            <span className="market-cell-num">{p.position}</span>
            <span className="market-cell-num">{p.age}</span>
            <span className="market-cell-num">{p.ovr}</span>
            <span className="market-cell-num">
              {formatMoney(p.askingSalary)}
            </span>
            <span className={`market-status ${st.cls}`}>{st.text}</span>
            <button
              type="button"
              className="btn btn-sm btn-primary market-action-btn"
              disabled={!canSign || busy === p.id || p.status === "claimed"}
              onClick={() => onSign(p)}
            >
              {busy === p.id ? "处理中…" : "签约"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── 职员市场表格 ──

function StaffMarketTable({
  staff,
  canSign,
  busy,
  onSign,
}: {
  staff: FreeAgentStaffView[];
  canSign: boolean;
  busy: string | null;
  onSign: (s: FreeAgentStaffView) => void;
}) {
  if (staff.length === 0) {
    return <div className="empty-block muted">该类型暂无自由职员</div>;
  }
  return (
    <div className="market-table">
      <div className="market-row market-row-head market-row-staff">
        <span>职员</span>
        <span>等级</span>
        <span>声望</span>
        <span>签约费</span>
        <span>日薪</span>
        <span>状态</span>
        <span>操作</span>
      </div>
      {staff.map((s) => {
        const st = statusLabel(s.status);
        return (
          <div key={s.id} className="market-row market-row-staff">
            <span className="market-cell-name">
              {s.name}
              <span className="market-cell-sub muted"> {s.jobLabel}</span>
            </span>
            <span className="market-cell-num">Lv.{s.level}</span>
            <span className="market-cell-num">{s.proReputation}</span>
            <span className="market-cell-num">{formatMoney(s.signOnCost)}</span>
            <span className="market-cell-num">{formatMoney(s.salaryPerDay)}</span>
            <span className={`market-status ${st.cls}`}>{st.text}</span>
            <button
              type="button"
              className="btn btn-sm btn-primary market-action-btn"
              disabled={!canSign || busy === s.id || s.status === "claimed"}
              onClick={() => onSign(s)}
            >
              {busy === s.id ? "处理中…" : "签约"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
