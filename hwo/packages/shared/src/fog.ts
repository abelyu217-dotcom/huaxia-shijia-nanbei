/**
 * HWO The Fog 信息迷雾系统——纯函数模块
 *
 * 参见 球探系统设计.html §3
 *
 * 核心原则：
 * 1. 所有非本队球员的能力/Peak 带 ±误差
 * 2. 球探报告收窄误差，但永远无法精确到真实值（fogFloor=2）
 * 3. Peak fog 比能力 fog 更难收窄（fogFloor=5）
 * 4. 同球员 7 日内重复探查收益递减（×0.7^次数）
 */

import type { Abilities, FogValue, Player, ScoutReport } from "./types.js";
import { overallRating } from "./generators.js";

/** 默认 fog 范围（未探查时） */
export const DEFAULT_FOG_RANGE = 20;

/** 能力 fog 下限（永远保留 ±2） */
export const ABILITY_FOG_FLOOR = 2;

/** Peak fog 下限（永远保留 ±5，比能力更难收窄） */
export const PEAK_FOG_FLOOR = 5;

/** 球探预算：单次球员探查基础消耗 */
export const PLAYER_SCOUT_COST = 50;

/** 球探预算：单次潜力探查基础消耗 */
export const POTENTIAL_SCOUT_COST = 80;

/** 每赛季球探预算总额 */
export const SEASON_SCOUT_BUDGET = 500;

/**
 * 按年龄返回 baseNarrow（基础收窄值）
 * 年轻苗子更难看清
 */
export function baseNarrow(age: number): number {
  if (age <= 12) return 2.0;
  if (age <= 15) return 3.0;
  if (age <= 18) return 4.0;
  if (age <= 25) return 5.0;
  return 4.5;
}

/**
 * 计算单次探查的 fog 收窄值
 *
 * @param age       目标球员年龄
 * @param scoutLevel 球探等级 1-5
 * @param scoutCount 该球员已被探查次数（7日内）
 * @param taskType  "player" | "potential"
 */
export function computeFogNarrow(
  age: number,
  scoutLevel: number,
  scoutCount: number,
  taskType: "player" | "potential" = "player",
): number {
  const base = baseNarrow(age);
  // 球探等级加成（0.4 / 级）
  const levelBonus = scoutLevel * 0.4;
  // 球探 skill roll（简化为等级 × 0.6）
  const skillBonus = scoutLevel * 0.6;

  let narrow = base + skillBonus + levelBonus;

  // 潜力探查收窄更弱（×0.6）
  if (taskType === "potential") {
    narrow *= 0.6;
  }

  // 7 日内重复探查收益递减：×0.7^(scoutCount)
  const diminishing = Math.pow(0.7, scoutCount);
  narrow *= diminishing;

  return Math.max(0, narrow);
}

/**
 * 收窄一个 FogValue
 * 取最窄区间，est 向真实值微调
 */
export function narrowFogValue(
  current: FogValue | undefined,
  realValue: number,
  narrow: number,
  floor: number,
): FogValue {
  const currentRange = current?.range ?? DEFAULT_FOG_RANGE;
  const newRange = Math.max(floor, currentRange - narrow);

  // est 向真实值微调（不跳变）
  const currentEst = current?.est ?? realValue;
  // 微调幅度 = 收窄值的 30% 向真实值靠拢
  const drift = (realValue - currentEst) * 0.3;
  const newEst = Math.round(currentEst + drift);

  return {
    est: Math.max(0, Math.min(99, newEst)),
    range: Math.round(newRange * 10) / 10,
  };
}

/**
 * 对单个球员应用 fog，生成带雾视图
 *
 * @param player       真实球员（含真实 abilities）
 * @param scoutReport  该经理对该球员的球探报告（无则为默认 fog）
 * @param isOwn        是否为本队球员（本队无 fog）
 * @param scoutLevel   球探等级 1-5
 * @param peak         球员真实潜力（Peak），无则 null
 */
export function applyFog(
  player: Player,
  scoutReport: ScoutReport | null,
  isOwn: boolean,
  _scoutLevel: number = 3,
  peak: number | null = null,
): {
  abilities: Partial<Record<keyof Abilities, FogValue>>;
  realAbilities?: Abilities;
  peak: FogValue | number | null;
  ovr: FogValue | number;
  traits: string[];
  scouted: boolean;
} {
  if (isOwn) {
    // 本队球员：全可见，无 fog
    return {
      abilities: {},
      realAbilities: player.abilities,
      peak: peak,
      ovr: overallRating(player.abilities),
      traits: player.traits,
      scouted: true,
    };
  }

  // 对手球员：应用 fog
  const abilityKeys = Object.keys(player.abilities) as (keyof Abilities)[];
  const foggedAbilities: Partial<Record<keyof Abilities, FogValue>> = {};

  for (const key of abilityKeys) {
    const realValue = player.abilities[key];
    const reported = scoutReport?.abilityFog[key];
    if (reported) {
      foggedAbilities[key] = reported;
    } else {
      // 未探查：默认 fog，est 为真实值加随机偏移（模拟粗略估值）
      const jitter = Math.round((Math.random() - 0.5) * 8);
      foggedAbilities[key] = {
        est: Math.max(0, Math.min(99, realValue + jitter)),
        range: DEFAULT_FOG_RANGE,
      };
    }
  }

  // OVR 带雾
  const reportedOvr = scoutReport
    ? computeFoggedOvr(foggedAbilities)
    : { est: overallRating(player.abilities) + Math.round((Math.random() - 0.5) * 10), range: DEFAULT_FOG_RANGE };

  // Peak 带雾
  let peakValue: FogValue | number | null = null;
  if (peak !== null) {
    if (scoutReport?.peakFog) {
      peakValue = scoutReport.peakFog;
    } else {
      peakValue = {
        est: peak + Math.round((Math.random() - 0.5) * 10),
        range: DEFAULT_FOG_RANGE,
      };
    }
  }

  // 特质：仅显示已探查的 traitHints
  const traits = scoutReport?.traitHints ?? [];

  return {
    abilities: foggedAbilities,
    peak: peakValue,
    ovr: reportedOvr,
    traits,
    scouted: !!scoutReport,
  };
}

/** 从带雾能力计算带雾 OVR（取各项 est 的加权平均） */
export function computeFoggedOvr(
  fogged: Partial<Record<keyof Abilities, FogValue>>,
): FogValue {
  const keys = Object.keys(fogged) as (keyof Abilities)[];
  if (keys.length === 0) return { est: 50, range: DEFAULT_FOG_RANGE };

  let sumEst = 0;
  let sumRange = 0;
  for (const k of keys) {
    const fv = fogged[k]!;
    sumEst += fv.est;
    sumRange += fv.range;
  }
  return {
    est: Math.round(sumEst / keys.length),
    range: Math.round((sumRange / keys.length) * 10) / 10,
  };
}

/**
 * 执行一次球员探查，返回更新后的 abilityFog 和 traitHints
 *
 * @param realAbilities  球员真实能力
 * @param realTraits     球员真实特质
 * @param age            球员年龄
 * @param scoutLevel     球探等级
 * @param existing       已有报告（无则 null）
 */
export function performPlayerScout(
  realAbilities: Abilities,
  realTraits: string[],
  age: number,
  scoutLevel: number,
  existing: ScoutReport | null,
): {
  abilityFog: Partial<Record<keyof Abilities, FogValue>>;
  traitHints: string[];
  scoutCount: number;
} {
  const scoutCount = (existing?.scoutCount ?? 0) + 1;
  const narrow = computeFogNarrow(age, scoutLevel, existing?.scoutCount ?? 0, "player");

  const abilityKeys = Object.keys(realAbilities) as (keyof Abilities)[];
  const abilityFog: Partial<Record<keyof Abilities, FogValue>> = {};

  for (const key of abilityKeys) {
    const realValue = realAbilities[key];
    abilityFog[key] = narrowFogValue(
      existing?.abilityFog[key],
      realValue,
      narrow,
      ABILITY_FOG_FLOOR,
    );
  }

  // 30% 概率获得 1 条特质线索
  const traitHints = [...(existing?.traitHints ?? [])];
  if (Math.random() < 0.3 && realTraits.length > 0) {
    const unknownTraits = realTraits.filter((t) => !traitHints.includes(t));
    if (unknownTraits.length > 0) {
      traitHints.push(unknownTraits[Math.floor(Math.random() * unknownTraits.length)]);
    }
  }

  return { abilityFog, traitHints, scoutCount };
}

/**
 * 执行一次潜力探查，返回更新后的 peakFog
 */
export function performPotentialScout(
  realPeak: number,
  age: number,
  scoutLevel: number,
  existing: ScoutReport | null,
): FogValue {
  const narrow = computeFogNarrow(age, scoutLevel, existing?.scoutCount ?? 0, "potential");

  return narrowFogValue(existing?.peakFog ?? undefined, realPeak, narrow, PEAK_FOG_FLOOR);
}
