/**
 * 前端展示用辅助函数与常量映射。
 */

import type {
  Abilities,
  Position,
  TacticCategory,
  TacticTempo,
  OffenseTendency,
  DefenseTendency,
} from "./types";

/** OVR 等级分档，用于球员卡片配色。 */
export type OvrTier = "gold" | "purple" | "blue" | "gray";

export function ovrTier(ovr: number): OvrTier {
  if (ovr >= 85) return "gold";
  if (ovr >= 80) return "purple";
  if (ovr >= 75) return "blue";
  return "gray";
}

export const POSITION_LABEL: Record<Position, string> = {
  PG: "控卫",
  SG: "分卫",
  SF: "小前",
  PF: "大前",
  C: "中锋",
};

export const TACTIC_CATEGORY_LABEL: Record<TacticCategory, string> = {
  off: "进攻型",
  def: "防守型",
  mix: "混合型",
  spec: "特殊型",
};

export const TACTIC_CATEGORY_ORDER: TacticCategory[] = [
  "off",
  "def",
  "mix",
  "spec",
];

export const TEMPO_LABEL: Record<TacticTempo, string> = {
  slow: "慢速",
  mid: "中速",
  fast: "快速",
  ultra_fast: "极速",
};

export const OFFENSE_LABEL: Record<OffenseTendency, string> = {
  outside: "外线",
  balanced: "均衡",
  inside: "内线",
};

export const DEFENSE_LABEL: Record<DefenseTendency, string> = {
  press: "施压",
  balanced: "均衡",
  pack: "收缩",
};

/** 球员卡片上展示的关键能力值（取自 Abilities 的子集）。 */
export interface AbilityMeta {
  key: keyof Abilities;
  label: string;
}

export const KEY_ABILITIES: AbilityMeta[] = [
  { key: "three", label: "三分" },
  { key: "midrange", label: "中投" },
  { key: "inside", label: "内线" },
  { key: "drive", label: "突破" },
  { key: "passing", label: "传球" },
  { key: "perimeterD", label: "外防" },
  { key: "interiorD", label: "内防" },
  { key: "speed", label: "速度" },
];

/** 计算球队平均 OVR。 */
export function avgOvr(ovrs: number[]): number {
  if (ovrs.length === 0) return 0;
  return Math.round(ovrs.reduce((a, b) => a + b, 0) / ovrs.length);
}

/** 两位数补零。 */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
