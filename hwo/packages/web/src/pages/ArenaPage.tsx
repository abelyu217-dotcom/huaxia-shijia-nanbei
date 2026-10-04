/**
 * ArenaPage — 运营中心 / 球馆设施页
 *
 * 原 ArenaPage 含 PvP（友好对战 + 排位赛）与球馆设施，
 * PvP 已拆分至 PvpPage（归入赛事分组），本页仅保留球馆设施升级。
 *
 *   - 训练馆升级：提升手动训练属性成长倍率
 *   - 主场馆升级：提升比赛日门票营收倍率与主场优势加成
 *
 * 对接：
 *   GET  /api/facility/:teamId → Facility
 *   POST /api/facility/:teamId/upgrade → Facility
 */

import { useCallback, useEffect, useState } from "react";
import { fetchFacility, postUpgradeFacility } from "../api";
import type { Facility, FacilityType } from "../types";
import { useAuth } from "../auth/AuthContext";

interface Props {
  teamId?: string;
}

export function ArenaPage({ teamId }: Props) {
  const { user } = useAuth();
  const myTeamId = teamId ?? user?.teamId ?? undefined;

  const [facility, setFacility] = useState<Facility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<FacilityType | null>(null);

  const load = useCallback(() => {
    if (!myTeamId) {
      setLoading(false);
      setError("未关联球队，无法查看球馆设施");
      return;
    }
    setLoading(true);
    setError(null);
    fetchFacility(myTeamId)
      .then((f) => setFacility(f))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setLoading(false));
  }, [myTeamId]);

  useEffect(() => {
    load();
  }, [load]);

  /** 升级球馆设施（消耗 Coins，由后端扣款） */
  const handleUpgradeFacility = async (type: FacilityType) => {
    if (!myTeamId || upgrading) return;
    setError(null);
    setUpgrading(type);
    try {
      const updated = await postUpgradeFacility(myTeamId, type);
      setFacility(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpgrading(null);
    }
  };

  if (loading) {
    return (
      <div className="arena-page">
        <div className="page-head">
          <h2>运营中心</h2>
        </div>
        <div className="state">
          <span className="spinner" /> 正在加载球馆设施…
        </div>
      </div>
    );
  }

  return (
    <div className="arena-page">
      <div className="page-head">
        <h2>运营中心 · 球馆设施</h2>
        <p className="muted">
          升级训练馆与主场馆，提升训练成长效率与比赛日营收
        </p>
      </div>

      {error && <div className="state error">{error}</div>}

      <section className="panel">
        <div className="panel-head">
          <h2>球馆设施</h2>
        </div>
        <div className="panel-body">
          {!facility ? (
            <div className="empty-block">暂无球馆设施数据</div>
          ) : (
            <div className="facility-grid">
              <FacilityCard
                title="训练馆"
                level={facility.trainingHallLv}
                effects={[
                  {
                    label: "训练成长倍率",
                    value: `×${facility.trainingMultiplier.toFixed(2)}`,
                  },
                ]}
                next={
                  facility.upgrades.trainingHall.cost != null
                    ? {
                        cost: facility.upgrades.trainingHall.cost,
                        nextLabel:
                          facility.upgrades.trainingHall.nextMultiplier != null
                            ? `×${facility.upgrades.trainingHall.nextMultiplier.toFixed(2)}`
                            : null,
                      }
                    : null
                }
                upgrading={upgrading === "trainingHall"}
                onUpgrade={() => handleUpgradeFacility("trainingHall")}
              />
              <FacilityCard
                title="主场馆"
                level={facility.arenaLv}
                effects={[
                  {
                    label: "比赛日营收倍率",
                    value: `×${facility.arenaRevenueMultiplier.toFixed(2)}`,
                  },
                  {
                    label: "主场优势加成",
                    value:
                      facility.homeAdvantageBonus > 0
                        ? `+${facility.homeAdvantageBonus.toFixed(1)}`
                        : "—",
                  },
                ]}
                next={
                  facility.upgrades.arena.cost != null
                    ? {
                        cost: facility.upgrades.arena.cost,
                        nextLabel:
                          facility.upgrades.arena.nextRevenue != null
                            ? `×${facility.upgrades.arena.nextRevenue.toFixed(2)}`
                            : null,
                      }
                    : null
                }
                upgrading={upgrading === "arena"}
                onUpgrade={() => handleUpgradeFacility("arena")}
              />
            </div>
          )}
          <p className="muted facility-tip">
            训练馆等级越高，手动训练属性成长越快；主场馆等级越高，比赛日门票营收与主场判罚优势越强。
          </p>
        </div>
      </section>
    </div>
  );
}

interface FacilityCardProps {
  title: string;
  level: number;
  effects: { label: string; value: string }[];
  next: { cost: number; nextLabel: string | null } | null;
  upgrading: boolean;
  onUpgrade: () => void;
}

function FacilityCard({
  title,
  level,
  effects,
  next,
  upgrading,
  onUpgrade,
}: FacilityCardProps) {
  return (
    <div className="facility-card">
      <div className="facility-card-head">
        <span className="facility-name">{title}</span>
        <span className="facility-level">Lv {level}</span>
      </div>
      <div className="facility-effects">
        {effects.map((e) => (
          <div key={e.label} className="facility-effect-row">
            <span>{e.label}</span>
            <strong>{e.value}</strong>
          </div>
        ))}
      </div>
      <div className="facility-upgrade">
        {next ? (
          <>
            <div className="facility-upgrade-info">
              <span>下一级</span>
              <strong>
                {next.nextLabel ?? "已封顶"}
              </strong>
              <span className="facility-cost">
                花费 {next.cost.toLocaleString()} Coins
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onUpgrade}
              disabled={upgrading}
            >
              {upgrading ? "升级中…" : "升级"}
            </button>
          </>
        ) : (
          <div className="facility-maxed">已满级</div>
        )}
      </div>
    </div>
  );
}
