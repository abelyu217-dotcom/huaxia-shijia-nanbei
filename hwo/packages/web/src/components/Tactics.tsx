/**
 * 页面 2：战术选择（Tactics）
 * - 20 个战术预设，按分类分组
 * - 为主队 / 客队各选一个战术，选中高亮
 */

import { useState } from "react";
import type { TacticPreset } from "../types";
import {
  TACTIC_CATEGORY_LABEL,
  TACTIC_CATEGORY_ORDER,
} from "../lib";
import { TacticCard } from "./TacticCard";

interface TacticsProps {
  tactics: TacticPreset[] | null;
  error: string | null;
  homeTacticId: string | null;
  awayTacticId: string | null;
  onPickTactic: (role: "home" | "away", tacticId: string) => void;
}

export function Tactics({
  tactics,
  error,
  homeTacticId,
  awayTacticId,
  onPickTactic,
}: TacticsProps) {
  const [mode, setMode] = useState<"home" | "away">("home");

  const nameOf = (id: string | null): string => {
    if (!id || !tactics) return "未选择";
    return tactics.find((t) => t.id === id)?.name ?? id;
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>战术选择</h2>
        <span className="hint">为主队与客队各选一套战术</span>
      </div>
      <div className="panel-body">
        <div className="control-bar">
          <div className="slots">
            <div className={`slot home${homeTacticId ? "" : " empty"}`}>
              <span className="slot-label">主队战术</span>
              <span className="slot-value">{nameOf(homeTacticId)}</span>
            </div>
            <div className={`slot away${awayTacticId ? "" : " empty"}`}>
              <span className="slot-label">客队战术</span>
              <span className="slot-value">{nameOf(awayTacticId)}</span>
            </div>
          </div>
          <div className="mode-toggle">
            <button
              type="button"
              className={`mode-btn home${mode === "home" ? " is-active" : ""}`}
              onClick={() => setMode("home")}
            >
              选主队
            </button>
            <button
              type="button"
              className={`mode-btn away${mode === "away" ? " is-active" : ""}`}
              onClick={() => setMode("away")}
            >
              选客队
            </button>
          </div>
        </div>

        {error ? (
          <div className="state error">战术加载失败：{error}</div>
        ) : !tactics ? (
          <div className="state">
            <span className="spinner" />
            正在加载战术…
          </div>
        ) : (
          TACTIC_CATEGORY_ORDER.map((cat) => {
            const list = tactics.filter((t) => t.category === cat);
            if (list.length === 0) return null;
            return (
              <section className="section" key={cat}>
                <h3 className="section-title">
                  {TACTIC_CATEGORY_LABEL[cat]}
                </h3>
                <div className="tactic-grid">
                  {list.map((t) => {
                    const selectedFor =
                      homeTacticId === t.id
                        ? "home"
                        : awayTacticId === t.id
                          ? "away"
                          : null;
                    return (
                      <TacticCard
                        key={t.id}
                        tactic={t}
                        selectedFor={selectedFor}
                        onClick={() => onPickTactic(mode, t.id)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
