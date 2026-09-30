/**
 * 球员卡片——展示位置、名字、OVR（按等级配色）、关键能力值条。
 * 支持 The Fog 迷雾系统：对手球员的能力显示为估值 ± 范围。
 */

import type { PlayerDetail, FogValue, Abilities } from "../types";
import { KEY_ABILITIES, POSITION_LABEL, ovrTier } from "../lib";

interface PlayerCardProps {
  player: PlayerDetail;
  /** 是否显示球探按钮（对手球员时） */
  onScout?: (playerId: string) => void;
  /** 是否已探查过 */
  scouted?: boolean;
}

/** 判断 abilities 项是否为带雾值 */
function isFogged(val: number | FogValue | undefined): val is FogValue {
  return typeof val === "object" && val !== null;
}

export function PlayerCard({ player, onScout, scouted }: PlayerCardProps) {
  // OVR 可能为带雾估值
  const ovrFogged = typeof player.ovr === "object" && player.ovr !== null;
  const foggedOvr = ovrFogged ? (player.ovr as FogValue) : null;
  const ovrVal = foggedOvr ? foggedOvr.est : (player.ovr as number);
  const ovrRange = foggedOvr ? foggedOvr.range : 0;
  const tier = ovrTier(ovrVal);

  return (
    <article className={`player-card tier-${tier}${ovrFogged ? " is-fogged" : ""}`}>
      <div className="pc-head">
        <div className="pc-ovr" aria-label={`综合评分 ${ovrVal}`}>
          {ovrVal}
          {ovrFogged && (
            <span className="pc-ovr-fog" title={`误差 ±${ovrRange}`}>
              ±{Math.round(ovrRange)}
            </span>
          )}
        </div>
        <div className="pc-id">
          <span className="pc-pos">
            {player.position} · {POSITION_LABEL[player.position]}
          </span>
          <span className="pc-name" title={player.name}>
            {player.name}
          </span>
          {ovrFogged && !scouted && (
            <span className="pc-fog-badge">未探查</span>
          )}
          {ovrFogged && scouted && (
            <span className="pc-fog-badge scouted">已探查</span>
          )}
        </div>
      </div>

      <div className="pc-abilities">
        {KEY_ABILITIES.map((ab) => {
          const val = (player.abilities as Abilities | Partial<Record<keyof Abilities, FogValue>>)[ab.key];
          const fogged = isFogged(val);
          const displayVal = fogged ? val.est : (val as number);
          return (
            <div className="pc-ability" key={ab.key}>
              <span className="pc-ab-label">
                <span>{ab.label}</span>
                <span className="pc-ab-val">
                  {displayVal}
                  {fogged && (
                    <span className="pc-ab-fog" title={`误差 ±${val.range}`}>
                      ±{Math.round(val.range)}
                    </span>
                  )}
                </span>
              </span>
              <div className="pc-ab-bar">
                <div
                  className={`pc-ab-fill${fogged ? " is-fogged" : ""}`}
                  style={{ width: `${Math.max(0, Math.min(99, displayVal))}%` }}
                />
                {fogged && (
                  <div
                    className="pc-ab-fog-range"
                    style={{
                      left: `${Math.max(0, displayVal - val.range)}%`,
                      width: `${Math.min(99, val.range * 2)}%`,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {onScout && (
        <div className="pc-actions">
          <button className="btn btn-sm btn-scout" onClick={() => onScout(player.id)}>
            🔍 球探
          </button>
        </div>
      )}
    </article>
  );
}
