/**
 * DynastyPage —— 王朝与传承系统（P3-3）
 *
 * - 球队王朝记录（等级/冠军数/传承评分）
 * - 名人堂名单（传奇/名人堂/荣誉堂）
 * - 球员传承遗产
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchTeamDynasty,
  fetchHallOfFame,
} from "../api";
import type { TeamDynastyView, HallOfFameView } from "../types";

interface Props {
  teamId: string;
}

const TIER_COLOR: Record<string, string> = {
  legendary: "#fbbf24",
  golden: "#f59e0b",
  silver: "#94a3b8",
  rising: "#4ade80",
};

const HOF_TIER_LABEL: Record<string, string> = {
  legendary: "传奇名人堂",
  hall: "名人堂",
  honor: "荣誉堂",
};

export function DynastyPage({ teamId }: Props) {
  const [dynasty, setDynasty] = useState<TeamDynastyView | null>(null);
  const [hof, setHof] = useState<HallOfFameView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTeamDynasty(teamId), fetchHallOfFame()])
      .then(([d, h]) => {
        setDynasty(d);
        setHof(h);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="state"><span className="spinner" /> 加载中…</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>王朝与传承</h2>
        <p className="page-sub">球队历史荣耀 · 名人堂 · 时代传承</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* 球队王朝 */}
      {dynasty && (
        <section className="card">
          <div className="card-title">
            <span className="badge gold">王朝</span>
            <h3>{dynasty.teamName} · 王朝记录</h3>
          </div>
          <div className="card-body">
            {/* 当前活跃王朝 */}
            {dynasty.activeDynasty ? (
              <div className="dynasty-active" style={{ borderColor: TIER_COLOR[dynasty.activeDynasty.tier] }}>
                <div className="dynasty-active-tier" style={{ color: TIER_COLOR[dynasty.activeDynasty.tier] }}>
                  {dynasty.activeDynasty.tierLabel}
                </div>
                <div className="dynasty-active-stats">
                  <span>冠军 <b>{dynasty.activeDynasty.titles}</b></span>
                  <span>传承评分 <b>{dynasty.activeDynasty.legacyScore}</b></span>
                </div>
              </div>
            ) : (
              <p className="muted">暂无活跃王朝，继续赢球来建立你的王朝！</p>
            )}

            <div className="dynasty-summary">
              <span>累计传承评分：<b>{dynasty.totalLegacyScore}</b></span>
              <span>王朝记录数：<b>{dynasty.records.length}</b></span>
            </div>

            {/* 王朝历史列表 */}
            {dynasty.records.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>等级</th>
                    <th>赛季</th>
                    <th>冠军</th>
                    <th>亚军</th>
                    <th>传承评分</th>
                    <th>标签</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {dynasty.records.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span style={{ color: TIER_COLOR[r.tier] ?? "#fff", fontWeight: 600 }}>
                          {r.tierLabel}
                        </span>
                      </td>
                      <td>{r.startSeason}{r.endSeason ? ` - ${r.endSeason}` : " - 至今"}</td>
                      <td>{r.titles}</td>
                      <td>{r.runnerUps}</td>
                      <td>{r.legacyScore}</td>
                      <td>{r.signatureTags.length > 0 ? r.signatureTags.join("、") : "—"}</td>
                      <td>{r.active ? <span className="badge green">活跃</span> : <span className="badge">已结束</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* 名人堂 */}
      {hof && (
        <section className="card">
          <div className="card-title">
            <span className="badge purple">名人堂</span>
            <h3>名人堂</h3>
          </div>
          <div className="card-body">
            {(["legendary", "hall", "honor"] as const).map((tier) => {
              const entries = hof[tier];
              if (entries.length === 0) return null;
              return (
                <div key={tier} className="hof-tier">
                  <h4 style={{ color: TIER_COLOR[tier] }}>
                    {HOF_TIER_LABEL[tier]}（{entries.length}）
                  </h4>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>球员</th>
                        <th>位置</th>
                        <th>冠军数</th>
                        <th>传承评分</th>
                        <th>入选赛季</th>
                        <th>叙事</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id}>
                          <td><b>{e.playerName}</b></td>
                          <td>{e.position}</td>
                          <td>{e.titles}</td>
                          <td>{e.legacyScore}</td>
                          <td>{e.inductedSeason}</td>
                          <td className="muted">{e.narrative ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {hof.legendary.length === 0 && hof.hall.length === 0 && hof.honor.length === 0 && (
              <p className="muted">名人堂尚无入选者。</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
