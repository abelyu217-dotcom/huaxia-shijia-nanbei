/**
 * TeamPage — 球队管理页
 *
 * Tab 切换：阵容 / 战术 / 球员
 * - 阵容：LineupEditor 编辑首发 + 出场时间（仅可编辑自己球队）
 * - 战术：TacticSelector 让用户挑选战术预设（M1 仅展示，M2 持久化）
 * - 球员：PlayerGrid 展示球队所有球员卡片
 */

import { useEffect, useState } from "react";
import { fetchTactics, fetchTeam } from "../api";
import type { TacticPreset, TeamDetail } from "../types";
import { useAuth } from "../auth/AuthContext";
import { LineupEditor } from "../components/LineupEditor";
import { PlayerCard } from "../components/PlayerCard";
import {
  DEFENSE_LABEL,
  OFFENSE_LABEL,
  TACTIC_CATEGORY_LABEL,
  TEMPO_LABEL,
} from "../lib";

type Tab = "lineup" | "tactics" | "players";

const TABS: { id: Tab; label: string }[] = [
  { id: "lineup", label: "阵容编辑" },
  { id: "tactics", label: "战术选择" },
  { id: "players", label: "球员详情" },
];

interface Props {
  teamId: string;
}

export function TeamPage({ teamId }: Props) {
  const { user } = useAuth();
  const isMine = user?.teamId === teamId;

  const [tab, setTab] = useState<Tab>("lineup");
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [tactics, setTactics] = useState<TacticPreset[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchTeam(teamId), fetchTactics()])
      .then(([t, ts]) => {
        if (cancelled) return;
        setTeam(t);
        setTactics(ts);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (loading) {
    return (
      <div className="state">
        <span className="spinner" /> 加载球队数据…
      </div>
    );
  }
  if (error) {
    return <div className="state error">球队加载失败：{error}</div>;
  }
  if (!team) return null;

  return (
    <div className="team-page">
      <div className="team-page-head">
        <div>
          <h2 className="team-page-name">{team.name}</h2>
          <span className="team-page-sub">
            {isMine ? "我的球队" : "其他球队（仅查看）"}
          </span>
        </div>
        <div className="team-page-tabs">
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
      </div>

      {tab === "lineup" && (
        <section className="panel">
          <div className="panel-head">
            <h2>首发阵容与出场时间</h2>
            <span className="hint">
              {isMine
                ? "勾选 5 名首发，调整出场时间（每人 0-48 min，总 200-240 min）"
                : "只读模式：你只能编辑自己球队的阵容"}
            </span>
          </div>
          <div className="panel-body">
            <LineupEditor teamId={teamId} editable={isMine} />
          </div>
        </section>
      )}

      {tab === "tactics" && (
        <section className="panel">
          <div className="panel-head">
            <h2>战术选择</h2>
            <span className="hint">M1 阶段仅展示，M2 将持久化用户选择</span>
          </div>
          <div className="panel-body">
            {tactics ? (
              <div className="tactic-grid">
                {tactics.map((t) => (
                  <div key={t.id} className="tactic-card">
                    <div className="tc-names">
                      <span className="tc-name">{t.name}</span>
                      <span className="tc-name-en">{t.nameEn}</span>
                    </div>
                    <div className="tc-chips">
                      <span className="chip">
                        {TACTIC_CATEGORY_LABEL[t.category]}
                      </span>
                      <span className="chip tempo">
                        {TEMPO_LABEL[t.tempo]}
                      </span>
                      <span className="chip">
                        进攻 · {OFFENSE_LABEL[t.offenseTendency]}
                      </span>
                      <span className="chip">
                        防守 · {DEFENSE_LABEL[t.defenseTendency]}
                      </span>
                    </div>
                    <p className="tc-desc">{t.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="state">无战术数据</div>
            )}
          </div>
        </section>
      )}

      {tab === "players" && (
        <section className="panel">
          <div className="panel-head">
            <h2>球员详情</h2>
            <span className="hint">{team.players.length} 名球员</span>
          </div>
          <div className="panel-body">
            <div className="player-grid">
              {team.players.map((p) => (
                <PlayerCard key={p.id} player={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
