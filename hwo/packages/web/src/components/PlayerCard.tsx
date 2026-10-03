/**
 * 球员卡片——展示位置、名字、OVR（按等级配色）、关键能力值条。
 * 支持 The Fog 迷雾系统：对手球员的能力显示为估值 ± 范围。
 */

import { useState } from "react";
import type { PlayerDetail, FogValue, Abilities, PlayerProfile } from "../types";
import { KEY_ABILITIES, POSITION_LABEL, ovrTier } from "../lib";

// 38 项档案分组展示配置（字段名须与 shared/types.ts 的 PlayerProfile 一致）
const PROFILE_GROUPS: {
  key: keyof PlayerProfile;
  label: string;
  fields: { key: string; label: string; unit?: string }[];
}[] = [
  {
    key: "physical",
    label: "静态体测",
    fields: [
      { key: "heightCm", label: "身高", unit: "cm" },
      { key: "armSpanCm", label: "臂展", unit: "cm" },
      { key: "standingReachCm", label: "站立摸高", unit: "cm" },
      { key: "weightKg", label: "体重", unit: "kg" },
      { key: "frame", label: "骨架" },
      { key: "handLength", label: "手长" },
      { key: "achilles", label: "跟腱" },
    ],
  },
  {
    key: "athletic",
    label: "运动属性",
    fields: [
      { key: "speed", label: "速度" },
      { key: "vertical", label: "弹跳" },
      { key: "strength", label: "力量" },
      { key: "agility", label: "敏捷" },
      { key: "stamina", label: "耐力" },
      { key: "lateral", label: "横移" },
      { key: "burst", label: "爆发" },
      { key: "flexibility", label: "柔韧" },
    ],
  },
  {
    key: "skill",
    label: "技术属性",
    fields: [
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
    ],
  },
  {
    key: "mental",
    label: "心智属性",
    fields: [
      { key: "workEthic", label: "敬业" },
      { key: "pressure", label: "抗压" },
      { key: "teamwork", label: "团队" },
      { key: "leadership", label: "领导力" },
      { key: "iq", label: "球商" },
    ],
  },
  {
    key: "hidden",
    label: "隐藏属性",
    fields: [
      { key: "injuryProne", label: "伤病倾向" },
      { key: "potential", label: "潜力" },
      { key: "personality", label: "性格" },
      { key: "loyalty", label: "忠诚" },
    ],
  },
];

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
  const [showProfile, setShowProfile] = useState(false);
  // OVR 可能为带雾估值
  const ovrFogged = typeof player.ovr === "object" && player.ovr !== null;
  const foggedOvr = ovrFogged ? (player.ovr as FogValue) : null;
  const ovrVal = foggedOvr ? foggedOvr.est : (player.ovr as number);
  const ovrRange = foggedOvr ? foggedOvr.range : 0;
  const tier = ovrTier(ovrVal);
  const hasProfile = !!player.profile;

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

      {hasProfile && (
        <button
          type="button"
          className="pc-profile-toggle"
          onClick={() => setShowProfile((v) => !v)}
          aria-expanded={showProfile}
        >
          {showProfile ? "收起详细档案 ▲" : "展开详细档案 ▼"}
        </button>
      )}

      {hasProfile && showProfile && (
        <div className="pc-profile">
          {PROFILE_GROUPS.map((group) => {
            const groupData = (player.profile as unknown as Record<string, Record<string, number>>)[group.key] ?? {};
            return (
              <div className="pc-profile-group" key={group.key}>
                <div className="pc-profile-group-label">{group.label}</div>
                <div className="pc-profile-fields">
                  {group.fields.map((f) => {
                    const val = groupData[f.key];
                    let display: string;
                    if (typeof val === "number") {
                      // 静态体测保留原始数值（cm/kg），其他 0-99 取整
                      display = group.key === "physical" ? String(val) : String(Math.round(val));
                    } else if (typeof val === "string") {
                      display = val; // potential 等级 / personality 标签
                    } else {
                      display = "—";
                    }
                    return (
                      <div className="pc-profile-field" key={f.key} title={f.label}>
                        <span className="pc-pf-label">{f.label}</span>
                        <span className="pc-pf-val">
                          {display}
                          {f.unit && typeof val === "number" ? ` ${f.unit}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
