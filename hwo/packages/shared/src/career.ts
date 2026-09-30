/**
 * 生涯弧线系统
 *
 * 五阶段：新秀(19-22) → 上升(23-27) → 巅峰(28-32) → 下滑(33-36) → 退役(37+)
 *
 * 每赛季根据年龄阶段 + 训练量 + 出场时间，能力值自然成长或衰退。
 */

import type { Abilities } from "./types.js";

/** 生涯阶段 */
export type CareerStage =
  | "rookie"    // 新秀 19-22
  | "rising"    // 上升 23-27
  | "prime"     // 巅峰 28-32
  | "decline"   // 下滑 33-36
  | "retired";  // 退役 37+

/** 根据年龄获取生涯阶段 */
export function getCareerStage(age: number): CareerStage {
  if (age <= 22) return "rookie";
  if (age <= 27) return "rising";
  if (age <= 32) return "prime";
  if (age <= 36) return "decline";
  return "retired";
}

/** 阶段标签 */
export const STAGE_LABEL: Record<CareerStage, string> = {
  rookie: "新秀",
  rising: "上升",
  prime: "巅峰",
  decline: "下滑",
  retired: "退役",
};

/** 各阶段成长/衰退倍率 */
const STAGE_GROWTH_RATE: Record<CareerStage, number> = {
  rookie: 1.0,    // 新秀：快速成长
  rising: 0.6,    // 上升：稳定成长
  prime: 0.0,     // 巅峰：持平
  decline: -0.8,  // 下滑：衰退
  retired: -2.0,  // 退役边缘：急速衰退
};

/** 退役阈值：综合 OVR 低于此值自动退役 */
const RETIRE_OVR_THRESHOLD = 55;

/** 计算球员综合 OVR */
export function computeOVR(abilities: Abilities): number {
  const values = Object.values(abilities);
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

/**
 * 赛季成长：根据年龄阶段 + 训练经验 + 出场时间，返回新的能力值
 *
 * @param abilities 当前能力值
 * @param age 当前年龄
 * @param potential 潜力上限
 * @param trainExp 训练经验值
 * @param minutesPerGame 场均出场时间（0-48）
 * @returns { abilities, ovr, trainExpGained, shouldRetire }
 */
export function applySeasonGrowth(
  abilities: Abilities,
  age: number,
  potential: number,
  minutesPerGame: number,
): {
  abilities: Abilities;
  ovr: number;
  trainExpGained: number;
  shouldRetire: boolean;
} {
  const stage = getCareerStage(age);
  const rate = STAGE_GROWTH_RATE[stage];

  // 训练经验增长：出场时间 + 基础训练
  const trainExpGained = Math.round(20 + minutesPerGame * 1.5);

  // 每点训练经验带来的成长（受阶段倍率影响）
  // const expGrowth = (totalExp / 100) * rate;  // 未来扩展用

  // 新能力值
  const newAbilities = { ...abilities };
  const keys = Object.keys(newAbilities) as (keyof Abilities)[];

  for (const key of keys) {
    const current = newAbilities[key];
    const ceiling = potential; // 潜力上限

    if (rate >= 0) {
      // 成长阶段：向潜力上限靠拢
      const room = ceiling - current;
      const growth = room * 0.04 * Math.max(rate, 0.1);
      newAbilities[key] = Math.min(99, Math.max(0, Math.round(current + growth)));
    } else {
      // 衰退阶段：能力下降
      const decline = current * 0.015 * Math.abs(rate);
      newAbilities[key] = Math.max(0, Math.round(current - decline));
    }
  }

  const ovr = computeOVR(newAbilities);

  // 退役判断：37+ 且 OVR 跌破阈值
  const shouldRetire = age >= 37 && ovr < RETIRE_OVR_THRESHOLD;

  return { abilities: newAbilities, ovr, trainExpGained, shouldRetire };
}

/**
 * 生成新秀球员的能力值（基于潜力）
 */
export function generateRookieAbilities(
  potential: number,
  position: string,
  rng: () => number,
): Abilities {
  // 新秀初始能力 = 潜力 * 0.65~0.75 的随机比例
  const ratio = 0.65 + rng() * 0.1;
  const base = Math.round(potential * ratio);

  // 按位置分配能力倾向
  const positionMod: Record<string, Partial<Record<keyof Abilities, number>>> = {
    PG: { passing: 8, ballHandle: 8, speed: 5, three: 3 },
    SG: { three: 5, midrange: 5, speed: 3 },
    SF: { midrange: 4, inside: 3, perimeterD: 4 },
    PF: { inside: 6, strength: 6, interiorD: 4 },
    C: { inside: 8, strength: 8, block: 6, jumping: 4 },
  };

  const mod = positionMod[position] ?? {};
  const rand = () => Math.round((rng() - 0.5) * 8);

  const keys: (keyof Abilities)[] = [
    "three", "midrange", "inside", "drive", "postup",
    "passing", "ballHandle",
    "perimeterD", "interiorD", "steal", "block",
    "speed", "strength", "jumping", "stamina",
    "iq", "clutch",
  ];

  const abilities = {} as Abilities;
  for (const key of keys) {
    const val = Math.min(99, Math.max(30, base + (mod[key] ?? 0) + rand()));
    abilities[key] = val;
  }

  return abilities;
}
