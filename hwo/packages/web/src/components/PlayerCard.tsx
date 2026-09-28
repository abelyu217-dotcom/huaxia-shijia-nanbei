/**
 * 球员卡片——展示位置、名字、OVR（按等级配色）、关键能力值条。
 */

import type { PlayerDetail } from "../types";
import { KEY_ABILITIES, POSITION_LABEL, ovrTier } from "../lib";

interface PlayerCardProps {
  player: PlayerDetail;
}

export function PlayerCard({ player }: PlayerCardProps) {
  const tier = ovrTier(player.ovr);

  return (
    <article className={`player-card tier-${tier}`}>
      <div className="pc-head">
        <div className="pc-ovr" aria-label={`综合评分 ${player.ovr}`}>
          {player.ovr}
        </div>
        <div className="pc-id">
          <span className="pc-pos">
            {player.position} · {POSITION_LABEL[player.position]}
          </span>
          <span className="pc-name" title={player.name}>
            {player.name}
          </span>
        </div>
      </div>

      <div className="pc-abilities">
        {KEY_ABILITIES.map((ab) => {
          const val = player.abilities[ab.key];
          return (
            <div className="pc-ability" key={ab.key}>
              <span className="pc-ab-label">
                <span>{ab.label}</span>
                <span className="pc-ab-val">{val}</span>
              </span>
              <div className="pc-ab-bar">
                <div
                  className="pc-ab-fill"
                  style={{ width: `${Math.max(0, Math.min(99, val))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
