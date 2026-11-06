/**
 * 战术预设卡片——中英文名、节奏、进攻/防守倾向、描述、选中高亮。
 */

import type { TacticPreset } from "../types";
import {
  TACTIC_CATEGORY_LABEL,
  TEMPO_LABEL,
  OFFENSE_LABEL,
  DEFENSE_LABEL,
} from "../lib";

interface TacticCardProps {
  tactic: TacticPreset;
  selectedFor: "home" | "away" | null;
  onClick: () => void;
}

export function TacticCard({ tactic, selectedFor, onClick }: TacticCardProps) {
  const cls = [
    "tactic-card",
    selectedFor === "home" ? "is-home" : "",
    selectedFor === "away" ? "is-away" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={cls} onClick={onClick}>
      <div className="tc-names">
        <span className="tc-name">{tactic.name}</span>
        <span className="tc-name-en">{tactic.nameEn}</span>
      </div>

      <div className="tc-chips">
        <span className="chip tempo">{TEMPO_LABEL[tactic.tempo]}</span>
        <span className="chip">攻·{OFFENSE_LABEL[tactic.offenseTendency]}</span>
        <span className="chip">守·{DEFENSE_LABEL[tactic.defenseTendency]}</span>
        <span className="chip">{TACTIC_CATEGORY_LABEL[tactic.category]}</span>
      </div>

      <p className="tc-desc">{tactic.desc}</p>

      {selectedFor && (
        <span className={`tc-selected ${selectedFor}`}>
          {selectedFor === "home" ? "▲ 主队战术" : "▼ 客队战术"}
        </span>
      )}
    </button>
  );
}
