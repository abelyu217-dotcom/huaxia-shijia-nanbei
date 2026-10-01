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
  PbpEvent,
  FogValue,
} from "./types";

/** OVR 等级分档，用于球员卡片配色。 */
export type OvrTier = "gold" | "purple" | "blue" | "gray";

export function ovrTier(ovr: number): OvrTier {
  if (ovr >= 85) return "gold";
  if (ovr >= 80) return "purple";
  if (ovr >= 75) return "blue";
  return "gray";
}

/** The Fog：从能力值（可能为 number 或 FogValue）中提取数值 */
export function abilityVal(v: number | FogValue | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return v.est;
}

/** The Fog：判断能力值是否为带雾估值 */
export function isFoggedAbility(v: number | FogValue | null | undefined): v is FogValue {
  return typeof v === "object" && v !== null;
}

/** The Fog：从 OVR（可能为 number 或 FogValue）中提取数值 */
export function ovrVal(ovr: number | FogValue | null | undefined): number {
  if (ovr == null) return 0;
  return typeof ovr === "number" ? ovr : ovr.est;
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

/** 事件类型对应的图标 */
export function eventIcon(type: string): string {
  switch (type) {
    case "shot_made":
    case "three_made":
      return "🏀";
    case "shot_miss":
    case "three_miss":
      return "🏀";
    case "free_throw":
      return "🎯";
    case "rebound":
      return "🔄";
    case "steal":
      return "✋";
    case "block":
      return "🧱";
    case "foul":
      return "🚫";
    case "turnover":
      return "⚠️";
    case "period_start":
    case "period_end":
      return "📢";
    default:
      return "·";
  }
}

/**
 * 生动事件文案——模拟 basketpulse 风格的描述性文字。
 * 优先用引擎生成的 desc，再根据事件类型补充更有画面感的措辞。
 */
export function vividDesc(ev: PbpEvent, playerName?: string): string {
  const name = playerName ?? "";
  switch (ev.type) {
    case "shot_made":
      return `${name} 稳稳命中两分${ev.assistId ? "，队友妙传助攻" : ""}`;
    case "three_made":
      return `${name} 三分线外手起刀落，命中！${ev.assistId ? "（助攻）" : ""}`;
    case "shot_miss":
      return `${name} 投篮不中`;
    case "three_miss":
      return `${name} 三分出手，弹框而出`;
    case "free_throw":
      return ev.made
        ? `${name} 稳稳地罚中这一球`
        : `${name} 罚球不中`;
    case "rebound":
      return ev.reboundType === "off"
        ? `${name} 抢到进攻篮板`
        : `${name} 稳稳摘下防守篮板`;
    case "steal":
      return `${name} 眼疾手快，抢断成功！`;
    case "block":
      return `${name} 送出一记大帽！`;
    case "foul":
      return ev.desc || `${name} 犯规`;
    case "turnover":
      return ev.desc || `${name || ev.teamId} 失误`;
    case "period_start":
      return `第 ${ev.quarter} 节比赛开始`;
    case "period_end":
      return `第 ${ev.quarter} 节结束`;
    default:
      return ev.desc;
  }
}
