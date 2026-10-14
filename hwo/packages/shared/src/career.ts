/**
 * 生涯弧线系统
 *
 * 五阶段：新秀(19-22) → 上升(23-27) → 巅峰(28-32) → 下滑(33-36) → 退役(37+)
 *
 * 每赛季根据年龄阶段 + 训练量 + 出场时间，能力值自然成长或衰退。
 */

import type { Abilities, PlayerProfile, PlayerStatus } from "./types.js";
import { deriveAbilities } from "./profile.js";

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

/** 状态标签（#13 状态色体系） */
export const STATUS_LABEL: Record<PlayerStatus, string> = {
  peak: "巅峰",
  good: "良好",
  tired: "疲劳",
  exhausted: "力竭",
};

/** 根据疲劳值（0-100）计算状态等级 */
export function getPlayerStatus(fatigue: number): PlayerStatus {
  if (fatigue < 15) return "peak";
  if (fatigue < 40) return "good";
  if (fatigue < 70) return "tired";
  return "exhausted";
}

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
 * 38 项档案层赛季成长（P0-① 属性双层结构）
 *
 * 按方案分组年龄曲线结算：
 * - 运动属性（athletic）：29 岁后衰退
 * - 技术属性（skill）：33 岁后衰退
 * - 心智属性（mental）：终身微涨，35 岁后持平
 * - 静态体测（physical）：身高/臂展/站立摸高不变；体重 30 后微增；frame 不变
 * - 隐藏属性（hidden）：injuryProne 随年龄上升；potential 不变
 *
 * @returns 新的 38 项 profile
 */
export function applyProfileGrowth(
  profile: PlayerProfile,
  age: number,
  potential: number,
  minutesPerGame: number,
): PlayerProfile {
  const p: PlayerProfile = JSON.parse(JSON.stringify(profile));

  // 成长系数：出场时间越多成长越快（0.5 ~ 1.2）
  const minutesFactor = 0.5 + Math.min(1, minutesPerGame / 40) * 0.7;

  // ---- 运动属性：29 岁为衰退拐点 ----
  const athleticRate = age < 29 ? 1.0 : age < 33 ? -0.4 : -0.8;
  for (const key of Object.keys(p.athletic) as (keyof PlayerProfile["athletic"])[]) {
    const cur = p.athletic[key];
    if (athleticRate >= 0) {
      const room = potential - cur;
      const growth = room * 0.04 * Math.max(athleticRate, 0.1) * minutesFactor;
      p.athletic[key] = Math.min(99, Math.max(0, Math.round(cur + growth)));
    } else {
      const decline = cur * 0.02 * Math.abs(athleticRate);
      p.athletic[key] = Math.max(0, Math.round(cur - decline));
    }
  }

  // ---- 技术属性：33 岁为衰退拐点 ----
  const skillRate = age < 33 ? 1.0 : -0.5;
  for (const key of Object.keys(p.skill) as (keyof PlayerProfile["skill"])[]) {
    const cur = p.skill[key];
    if (skillRate >= 0) {
      const room = potential - cur;
      const growth = room * 0.035 * Math.max(skillRate, 0.1) * minutesFactor;
      p.skill[key] = Math.min(99, Math.max(0, Math.round(cur + growth)));
    } else {
      const decline = cur * 0.012 * Math.abs(skillRate);
      p.skill[key] = Math.max(0, Math.round(cur - decline));
    }
  }

  // ---- 心智属性：终身微涨，35 岁后持平（确定性：每 3 岁 +1）----
  const mentalCeiling = 9; // 心智 1-10 上限
  if (age <= 35) {
    (["workEthic", "pressure", "teamwork", "leadership"] as const).forEach((k) => {
      const cur = p.mental[k];
      if (cur < mentalCeiling && age % 3 === 0) {
        p.mental[k] = Math.min(mentalCeiling, cur + 1);
      }
    });
    // iq 0-99，缓慢上涨
    const iqRoom = potential - p.mental.iq;
    p.mental.iq = Math.min(99, Math.max(0, Math.round(p.mental.iq + iqRoom * 0.01 * minutesFactor)));
  }

  // ---- 静态体测：身高/臂展/摸高不变；体重 30 后微增 ----
  if (age >= 30) {
    p.physical.weightKg = Math.min(p.physical.weightKg + 1, 140);
  }

  // ---- 隐藏属性：injuryProne 随年龄上升 ----
  if (age >= 30 && age % 2 === 0) {
    p.hidden.injuryProne = Math.min(10, p.hidden.injuryProne + 1);
  }

  return p;
}

/**
 * 赛季成长：根据年龄阶段 + 训练经验 + 出场时间，返回新的能力值
 *
 * 若传入 profile（38 项），则在档案层结算并推导 17 项；否则在 17 项能力层结算（兼容存量）。
 *
 * @param abilities 当前能力值
 * @param age 当前年龄
 * @param potential 潜力上限
 * @param minutesPerGame 场均出场时间（0-48）
 * @param profile 可选 38 项档案（P0-①）
 * @returns { abilities, profile?, ovr, trainExpGained, shouldRetire }
 */
export function applySeasonGrowth(
  abilities: Abilities,
  age: number,
  potential: number,
  minutesPerGame: number,
  profile?: PlayerProfile,
): {
  abilities: Abilities;
  profile?: PlayerProfile;
  ovr: number;
  trainExpGained: number;
  shouldRetire: boolean;
} {
  // 训练经验增长：出场时间 + 基础训练
  const trainExpGained = Math.round(20 + minutesPerGame * 1.5);

  let newAbilities: Abilities;
  let newProfile: PlayerProfile | undefined;

  if (profile) {
    // P0-①：38 项档案层成长 → 推导 17 项
    newProfile = applyProfileGrowth(profile, age, potential, minutesPerGame);
    newAbilities = deriveAbilities(newProfile);
  } else {
    // 兼容：17 项能力层成长
    const stage = getCareerStage(age);
    const rate = STAGE_GROWTH_RATE[stage];
    newAbilities = { ...abilities };
    const keys = Object.keys(newAbilities) as (keyof Abilities)[];

    for (const key of keys) {
      const current = newAbilities[key];
      const ceiling = potential;

      if (rate >= 0) {
        const room = ceiling - current;
        const growth = room * 0.04 * Math.max(rate, 0.1);
        newAbilities[key] = Math.min(99, Math.max(0, Math.round(current + growth)));
      } else {
        const decline = current * 0.015 * Math.abs(rate);
        newAbilities[key] = Math.max(0, Math.round(current - decline));
      }
    }
  }

  const ovr = computeOVR(newAbilities);
  const shouldRetire = age >= 37 && ovr < RETIRE_OVR_THRESHOLD;

  return { abilities: newAbilities, profile: newProfile, ovr, trainExpGained, shouldRetire };
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
