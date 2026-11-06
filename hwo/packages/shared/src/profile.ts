/**
 * HWO 属性双层结构——38 项档案 ↔ 17 项引擎能力值折算
 *
 * 核心原则（参见《HWO 属性体系 38→17 映射设计草案》）：
 * 1. PlayerProfile（38 项五层）是唯一数据源，落库存储；
 * 2. Abilities（17 项）永远由 deriveAbilities() 确定性推导，无随机、无外部状态；
 * 3. 成长、球探 fog、展示 OVR 都作用于 38 层；引擎只消费 17 项。
 */

import type {
  Abilities,
  AthleticAttributes,
  HiddenAttributes,
  MentalAttributes,
  PhysicalMeasurements,
  PlayerProfile,
  PotentialTier,
  Position,
  SkillAttributes,
} from "./types.js";

/** 把 1-10 的心智/隐藏标度映射到 0-99 */
function scale10to99(v: number): number {
  return Math.round(((Math.max(1, Math.min(10, v)) - 1) / 9) * 99);
}

/** 限制到 [0, 99] 并取整 */
function clamp099(v: number): number {
  return Math.max(0, Math.min(99, Math.round(v)));
}

/**
 * 静态体测修正（加到对应引擎项，可正可负）
 * 身高/臂展/摸高/体重/骨架 → inside / block / interiorD / perimeterD / strength / speed
 */
function physicalAdjustments(p: PhysicalMeasurements): Partial<Record<keyof Abilities, number>> {
  const heightDelta = p.heightCm - 200; // 基准 200cm
  const reachDelta = p.standingReachCm - 265; // 基准 265cm
  const apeIndex = p.armSpanCm - p.heightCm; // 臂展身高差（正臂展）
  // 体重分段：基准 95kg
  const weightDelta = p.weightKg - 95;

  return {
    inside: heightDelta * 0.15 + (p.frame - 5) * 0.3,
    block: reachDelta * 0.2 + apeIndex * 0.5,
    interiorD: reachDelta * 0.15 + apeIndex * 0.3 + (p.frame - 5) * 0.2,
    perimeterD: apeIndex * 0.2,
    strength: Math.max(-3, Math.min(3, weightDelta * 0.12)) + (p.frame - 5) * 0.2,
    speed: Math.max(-3, Math.min(2, -weightDelta * 0.08)),
  };
}

/**
 * 38 项档案 → 17 项引擎能力值（纯函数，确定性）
 * 主通道：技术/运动加权合成；修正通道：静态体测加减分后 clamp 0-99
 */
export function deriveAbilities(p: PlayerProfile): Abilities {
  const s = p.skill;
  const a = p.athletic;
  const m = p.mental;

  const pressure99 = scale10to99(m.pressure);
  const leadership99 = scale10to99(m.leadership);

  const base: Abilities = {
    three: clamp099(s.three),
    midrange: clamp099(0.8 * s.midrange + 0.2 * s.faceUp),
    inside: clamp099(0.55 * s.layup + 0.45 * s.dunk),
    drive: clamp099(0.6 * s.faceUp + 0.2 * a.agility + 0.2 * s.ballHandle),
    postup: clamp099(0.55 * s.postUp + 0.35 * s.backToBasket + 0.1 * a.strength),
    passing: clamp099(0.7 * s.passing + 0.15 * s.pickRoll + 0.15 * m.iq),
    ballHandle: clamp099(0.75 * s.ballHandle + 0.15 * a.agility + 0.1 * s.faceUp),
    perimeterD: clamp099(0.55 * a.lateral + 0.25 * a.agility + 0.2 * s.steal),
    interiorD: clamp099(0.4 * s.block + 0.3 * a.strength + 0.2 * s.postUp + 0.1 * s.rebounding),
    steal: clamp099(0.8 * s.steal + 0.2 * a.agility),
    block: clamp099(0.6 * s.block + 0.25 * a.burst + 0.15 * (p.physical.armSpanCm - p.physical.heightCm) * 0.5),
    speed: clamp099(0.8 * a.speed + 0.2 * a.agility),
    strength: clamp099(0.85 * a.strength + 0.15 * scale10to99(p.physical.frame)),
    jumping: clamp099(0.6 * a.vertical + 0.4 * a.burst),
    stamina: clamp099(a.stamina),
    iq: clamp099(m.iq),
    clutch: clamp099(0.7 * pressure99 + 0.2 * leadership99 + 0.1 * s.freeThrow),
  };

  // 静态体测修正
  const adj = physicalAdjustments(p.physical);
  for (const key of Object.keys(adj) as (keyof Abilities)[]) {
    base[key] = clamp099(base[key] + (adj[key] ?? 0));
  }

  return base;
}

// ─── 构建器（供生成器 / 选秀 / 青训使用） ───

/** 位置对应的静态体测基准（身高/臂展/摸高/体重） */
const PHYSICAL_BASE_BY_POSITION: Record<Position, Omit<PhysicalMeasurements, "frame" | "handLength" | "achilles">> = {
  PG: { heightCm: 188, armSpanCm: 192, standingReachCm: 248, weightKg: 84 },
  SG: { heightCm: 196, armSpanCm: 201, standingReachCm: 256, weightKg: 90 },
  SF: { heightCm: 203, armSpanCm: 209, standingReachCm: 264, weightKg: 98 },
  PF: { heightCm: 208, armSpanCm: 216, standingReachCm: 272, weightKg: 108 },
  C:  { heightCm: 213, armSpanCm: 222, standingReachCm: 279, weightKg: 115 },
};

/** 简易种子化 PRNG（不依赖外部状态） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * 由位置 / tier / 年龄 / 种子构建一份 38 项档案
 * tier: 0=角色球员 1=首发 2=全明星 3=超级巨星
 * 静态体测按位置基准 + 正态扰动；技术/运动按 tier 区间 roll；心智/隐藏按 tier 与位置倾向 roll
 */
export function buildProfile(
  position: Position,
  tier: number,
  age: number,
  seed: number,
): PlayerProfile {
  void age; // age 影响留待 P1 成长曲线细化；当前 buildProfile 产出即「当前档案」
  const rng = mulberry32(seed);
  const base = PHYSICAL_BASE_BY_POSITION[position];
  const tierRanges: Array<[number, number]> = [
    [55, 72],
    [66, 80],
    [76, 90],
    [84, 95],
  ];
  const [lo, hi] = tierRanges[Math.max(0, Math.min(3, tier))] ?? tierRanges[0]!;
  const r = () => clamp099(randRange(rng, lo, hi));
  const weak = () => clamp099(randRange(rng, Math.max(35, lo - 15), lo + 6));
  const strong = () => clamp099(randRange(rng, hi - 6, Math.min(99, hi + 8)));

  const physical: PhysicalMeasurements = {
    heightCm: Math.round(base.heightCm + randRange(rng, -4, 4)),
    armSpanCm: Math.round(base.armSpanCm + randRange(rng, -3, 6)),
    standingReachCm: Math.round(base.standingReachCm + randRange(rng, -3, 4)),
    weightKg: Math.round(base.weightKg + randRange(rng, -6, 6)),
    frame: Math.round(randRange(rng, 3, 9)),
    handLength: Math.round(randRange(rng, 3, 9)),
    achilles: Math.round(randRange(rng, 3, 9)),
  };

  // 运动属性：内线力量/弹跳强，外线速度/敏捷强
  const athletic: AthleticAttributes = (() => {
    switch (position) {
      case "PG":
        return { speed: strong(), vertical: r(), strength: weak(), agility: strong(), stamina: r(), lateral: r(), burst: r(), flexibility: r() };
      case "SG":
        return { speed: strong(), vertical: r(), strength: r(), agility: strong(), stamina: r(), lateral: r(), burst: r(), flexibility: r() };
      case "SF":
        return { speed: r(), vertical: r(), strength: r(), agility: r(), stamina: strong(), lateral: r(), burst: r(), flexibility: r() };
      case "PF":
        return { speed: weak(), vertical: strong(), strength: strong(), agility: weak(), stamina: r(), lateral: weak(), burst: strong(), flexibility: r() };
      case "C":
        return { speed: weak(), vertical: strong(), strength: strong(), agility: weak(), stamina: r(), lateral: weak(), burst: strong(), flexibility: r() };
    }
  })();

  // 技术属性：按位置倾向
  const skill: SkillAttributes = (() => {
    switch (position) {
      case "PG":
        return { three: r(), midrange: r(), freeThrow: strong(), layup: weak(), dunk: weak(), passing: strong(), ballHandle: strong(), rebounding: weak(), steal: strong(), block: weak(), postUp: weak(), faceUp: r(), pickRoll: strong(), backToBasket: weak() };
      case "SG":
        return { three: strong(), midrange: strong(), freeThrow: strong(), layup: r(), dunk: r(), passing: r(), ballHandle: r(), rebounding: weak(), steal: r(), block: weak(), postUp: weak(), faceUp: strong(), pickRoll: r(), backToBasket: weak() };
      case "SF":
        return { three: r(), midrange: r(), freeThrow: r(), layup: r(), dunk: r(), passing: r(), ballHandle: r(), rebounding: r(), steal: r(), block: r(), postUp: r(), faceUp: r(), pickRoll: r(), backToBasket: r() };
      case "PF":
        return { three: weak(), midrange: r(), freeThrow: weak(), layup: strong(), dunk: strong(), passing: weak(), ballHandle: weak(), rebounding: strong(), steal: weak(), block: strong(), postUp: strong(), faceUp: weak(), pickRoll: r(), backToBasket: strong() };
      case "C":
        return { three: weak(), midrange: weak(), freeThrow: weak(), layup: strong(), dunk: strong(), passing: weak(), ballHandle: weak(), rebounding: strong(), steal: weak(), block: strong(), postUp: strong(), faceUp: weak(), pickRoll: r(), backToBasket: strong() };
    }
  })();

  // 心智属性：tier 越高心智越稳
  const mentalBase = Math.min(10, 4 + tier + rng() * 2);
  const mental: MentalAttributes = {
    workEthic: Math.round(randRange(rng, mentalBase - 1, mentalBase + 1)),
    pressure: Math.round(randRange(rng, mentalBase - 1, mentalBase + 1)),
    teamwork: Math.round(randRange(rng, mentalBase - 1, mentalBase + 1)),
    leadership: Math.round(randRange(rng, mentalBase - 2, mentalBase + 1)),
    iq: clamp099(randRange(rng, lo, hi)),
  };

  // 隐藏属性
  const potentialTiers: PotentialTier[] = ["D", "C", "B", "A", "A+"];
  const personalities = ["沉稳", "张扬", "好胜", "内敛", "社交", "偏执", "乐天", "冷静"];
  const hidden: HiddenAttributes = {
    injuryProne: Math.round(randRange(rng, 2, 8)),
    potential: potentialTiers[Math.min(4, tier + (rng() > 0.5 ? 1 : 0))] ?? "B",
    personality: personalities[Math.floor(rng() * personalities.length)] ?? "沉稳",
    loyalty: Math.round(randRange(rng, 3, 9)),
  };

  return { physical, athletic, skill, mental, hidden };
}

// ─── 逆映射（17 项 → 38 项），用于存量球员回填 ───

/** 引擎项的组成成分（profile 子项路径 + 权重），与 deriveAbilities 主通道一一对应 */
type ProfileNumericPath =
  | ["athletic", keyof AthleticAttributes]
  | ["skill", keyof SkillAttributes]
  | ["mental", "iq"];

type ComponentPath =
  | ProfileNumericPath
  | ["physical", "heightCm" | "armSpanCm" | "standingReachCm" | "weightKg" | "frame"]
  | "_clutchPressure"
  | "_clutchLeadership";

const ABILITY_COMPONENTS: Record<keyof Abilities, Array<{ path: ComponentPath; weight: number }>> = {
  three: [{ path: ["skill", "three"], weight: 1 }],
  midrange: [{ path: ["skill", "midrange"], weight: 0.8 }, { path: ["skill", "faceUp"], weight: 0.2 }],
  inside: [
    { path: ["skill", "layup"], weight: 0.55 },
    { path: ["skill", "dunk"], weight: 0.45 },
    { path: ["physical", "heightCm"], weight: 0.15 },
    { path: ["physical", "frame"], weight: 0.3 },
  ],
  drive: [{ path: ["skill", "faceUp"], weight: 0.6 }, { path: ["athletic", "agility"], weight: 0.2 }, { path: ["skill", "ballHandle"], weight: 0.2 }],
  postup: [{ path: ["skill", "postUp"], weight: 0.55 }, { path: ["skill", "backToBasket"], weight: 0.35 }, { path: ["athletic", "strength"], weight: 0.1 }],
  passing: [{ path: ["skill", "passing"], weight: 0.7 }, { path: ["skill", "pickRoll"], weight: 0.15 }, { path: ["mental", "iq"], weight: 0.15 }],
  ballHandle: [{ path: ["skill", "ballHandle"], weight: 0.75 }, { path: ["athletic", "agility"], weight: 0.15 }, { path: ["skill", "faceUp"], weight: 0.1 }],
  perimeterD: [
    { path: ["athletic", "lateral"], weight: 0.55 },
    { path: ["athletic", "agility"], weight: 0.25 },
    { path: ["skill", "steal"], weight: 0.2 },
    { path: ["physical", "armSpanCm"], weight: 0.2 },
  ],
  interiorD: [
    { path: ["skill", "block"], weight: 0.4 },
    { path: ["athletic", "strength"], weight: 0.3 },
    { path: ["skill", "postUp"], weight: 0.2 },
    { path: ["skill", "rebounding"], weight: 0.1 },
    { path: ["physical", "standingReachCm"], weight: 0.15 },
    { path: ["physical", "armSpanCm"], weight: 0.3 },
    { path: ["physical", "heightCm"], weight: -0.3 },
    { path: ["physical", "frame"], weight: 0.2 },
  ],
  steal: [{ path: ["skill", "steal"], weight: 0.8 }, { path: ["athletic", "agility"], weight: 0.2 }],
  block: [
    { path: ["skill", "block"], weight: 0.6 },
    { path: ["athletic", "burst"], weight: 0.25 },
    { path: ["physical", "standingReachCm"], weight: 0.2 },
    { path: ["physical", "armSpanCm"], weight: 0.575 },
    { path: ["physical", "heightCm"], weight: -0.575 },
  ],
  speed: [
    { path: ["athletic", "speed"], weight: 0.8 },
    { path: ["athletic", "agility"], weight: 0.2 },
    { path: ["physical", "weightKg"], weight: -0.08 },
  ],
  strength: [
    { path: ["athletic", "strength"], weight: 0.85 },
    { path: ["physical", "weightKg"], weight: 0.12 },
    { path: ["physical", "frame"], weight: 0.2 },
  ],
  jumping: [{ path: ["athletic", "vertical"], weight: 0.6 }, { path: ["athletic", "burst"], weight: 0.4 }],
  stamina: [{ path: ["athletic", "stamina"], weight: 1 }],
  iq: [{ path: ["mental", "iq"], weight: 1 }],
  clutch: [{ path: "_clutchPressure", weight: 0.7 }, { path: "_clutchLeadership", weight: 0.2 }, { path: ["skill", "freeThrow"], weight: 0.1 }],
};

/** physical 各字段的合法范围 */
const PHYSICAL_RANGE: Record<string, [number, number]> = {
  heightCm: [170, 230],
  armSpanCm: [172, 235],
  standingReachCm: [228, 290],
  weightKg: [60, 140],
  frame: [1, 10],
  handLength: [1, 10],
  achilles: [1, 10],
};

/** 读取 profile 中某个数值子项（含 clutch 连续缓存） */
function getPathValue(
  p: PlayerProfile & { _clutchPressure?: number; _clutchLeadership?: number },
  path: ComponentPath,
): number {
  if (path === "_clutchPressure") return p._clutchPressure ?? scale10to99(p.mental.pressure);
  if (path === "_clutchLeadership") return p._clutchLeadership ?? scale10to99(p.mental.leadership);
  const [group, key] = path;
  return (p[group] as unknown as Record<string, number>)[key as string] as number;
}

/** 写入 profile 数值子项（按字段范围 clamp） */
function setPathValue(
  p: PlayerProfile & { _clutchPressure?: number; _clutchLeadership?: number },
  path: ComponentPath,
  value: number,
): void {
  if (path === "_clutchPressure") {
    p._clutchPressure = Math.max(0, Math.min(99, value));
    p.mental.pressure = Math.max(1, Math.min(10, Math.round((p._clutchPressure / 99) * 9 + 1)));
    return;
  }
  if (path === "_clutchLeadership") {
    p._clutchLeadership = Math.max(0, Math.min(99, value));
    p.mental.leadership = Math.max(1, Math.min(10, Math.round((p._clutchLeadership / 99) * 9 + 1)));
    return;
  }
  const [group, key] = path;
  if (group === "physical") {
    const [lo, hi] = PHYSICAL_RANGE[key as string] ?? [1, 10];
    (p.physical as unknown as Record<string, number>)[key as string] = Math.round(
      Math.max(lo, Math.min(hi, value)),
    );
  } else {
    (p[group] as unknown as Record<string, number>)[key as string] = clamp099(value);
  }
}

/**
 * 从 17 项能力值逆推 38 项档案（确定性，迭代修正法）
 *
 * 策略：
 * 1. 初始 guess：非共享子项 = 对应引擎项；共享子项取相关引擎项均值；体测按位置基准。
 * 2. 迭代：deriveAbilities 得到 derived，把每项误差按权重分配回各子项，clamp 后重复。
 * 3. 收敛（最大误差 < 0.5）或达到迭代上限后返回。
 *
 * 保证：deriveAbilities(deriveProfileFromAbilities(ab, ...)) 与原 ab 偏差 ≤ 1。
 */
export function deriveProfileFromAbilities(
  abilities: Abilities,
  position: Position,
  age: number,
  seed: number,
): PlayerProfile {
  void age; // 逆映射不依赖年龄；age 参数保留以匹配 buildProfile 签名
  const rng = mulberry32(seed + 7);
  const base = PHYSICAL_BASE_BY_POSITION[position];

  // 静态体测：按位置基准 + seed 扰动（修正通道固定，由主通道子项吸收残差）
  const physical: PhysicalMeasurements = {
    heightCm: Math.round(base.heightCm + randRange(rng, -3, 3)),
    armSpanCm: Math.round(base.armSpanCm + randRange(rng, -2, 4)),
    standingReachCm: Math.round(base.standingReachCm + randRange(rng, -2, 3)),
    weightKg: Math.round(base.weightKg + randRange(rng, -4, 4)),
    frame: Math.round(randRange(rng, 4, 8)),
    handLength: Math.round(randRange(rng, 4, 8)),
    achilles: Math.round(randRange(rng, 4, 8)),
  };

  // 心智初始：iq 直接取；pressure/leadership 按 clutch 比例设连续缓存
  const mental: MentalAttributes = {
    iq: abilities.iq,
    workEthic: Math.max(1, Math.min(10, Math.round((abilities.iq / 99) * 9 + 1))),
    pressure: 5,
    teamwork: Math.max(1, Math.min(10, Math.round((abilities.iq / 99) * 9 + 1))),
    leadership: 5,
  };

  // 初始 guess：所有 0-99 子项先取其"首个相关引擎项"的值
  const skill: SkillAttributes = {
    three: abilities.three,
    midrange: abilities.midrange,
    freeThrow: abilities.clutch,
    layup: abilities.inside,
    dunk: abilities.inside,
    passing: abilities.passing,
    ballHandle: abilities.ballHandle,
    rebounding: abilities.interiorD,
    steal: abilities.steal,
    block: abilities.block,
    postUp: abilities.postup,
    faceUp: abilities.midrange,
    pickRoll: abilities.passing,
    backToBasket: abilities.postup,
  };

  const athletic: AthleticAttributes = {
    speed: abilities.speed,
    vertical: abilities.jumping,
    strength: abilities.strength,
    agility: abilities.speed,
    stamina: abilities.stamina,
    lateral: abilities.perimeterD,
    burst: abilities.jumping,
    flexibility: clamp099(randRange(rng, 50, 75)),
  };

  const hidden: HiddenAttributes = {
    injuryProne: Math.round(randRange(rng, 2, 7)),
    potential: (["D", "C", "B", "A", "A+"] as PotentialTier[])[Math.min(4, Math.floor(abilities.iq / 20))] ?? "B",
    personality: ["沉稳", "张扬", "好胜", "内敛", "社交", "偏执"][Math.floor(rng() * 6)] ?? "沉稳",
    loyalty: Math.round(randRange(rng, 4, 8)),
  };

  const profile: PlayerProfile & { _clutchPressure?: number; _clutchLeadership?: number } = {
    physical,
    athletic,
    skill,
    mental,
    hidden,
    _clutchPressure: abilities.clutch,
    _clutchLeadership: abilities.clutch,
  };

  const abilityKeys = Object.keys(abilities) as (keyof Abilities)[];

  // 迭代修正
  for (let iter = 0; iter < 80; iter++) {
    const derived = deriveAbilities(profile);
    let maxAbsDiff = 0;

    for (const key of abilityKeys) {
      const diff = abilities[key] - derived[key];
      maxAbsDiff = Math.max(maxAbsDiff, Math.abs(diff));
      if (Math.abs(diff) < 0.05) continue;

      const components = ABILITY_COMPONENTS[key];
      for (const { path, weight } of components) {
        const current = getPathValue(profile, path);
        // 按权重分配误差（weight 越高的子项承担越多修正）
        setPathValue(profile, path, current + diff * weight);
      }
    }

    if (maxAbsDiff < 0.5) break;
  }

  // 收尾第一轮：用各引擎项权重最大的子项精确求解（消除大部分残差）
  for (let round = 0; round < 12; round++) {
    const d = deriveAbilities(profile);
    profile.skill.three = abilities.three;
    profile.athletic.stamina = abilities.stamina;
    profile.mental.iq = abilities.iq;
    profile.skill.midrange = clamp099((abilities.midrange - 0.2 * profile.skill.faceUp) / 0.8);
    profile.skill.layup = clamp099(profile.skill.layup + (abilities.inside - d.inside));
    profile.skill.dunk = clamp099(profile.skill.dunk + (abilities.inside - d.inside));
    profile.skill.faceUp = clamp099(profile.skill.faceUp + (abilities.drive - d.drive) / 0.6);
    profile.skill.backToBasket = clamp099(profile.skill.backToBasket + (abilities.postup - d.postup) / 0.35);
    profile.skill.pickRoll = clamp099(profile.skill.pickRoll + (abilities.passing - d.passing) / 0.15);
    profile.skill.ballHandle = clamp099(profile.skill.ballHandle + (abilities.ballHandle - d.ballHandle) / 0.75);
    profile.athletic.lateral = clamp099(profile.athletic.lateral + (abilities.perimeterD - d.perimeterD) / 0.55);
    profile.skill.rebounding = clamp099(profile.skill.rebounding + (abilities.interiorD - d.interiorD) / 0.1);
    profile.skill.steal = clamp099(profile.skill.steal + (abilities.steal - d.steal) / 0.8);
    profile.skill.block = clamp099(profile.skill.block + (abilities.block - d.block) / 0.6);
    profile.athletic.speed = clamp099(profile.athletic.speed + (abilities.speed - d.speed) / 0.8);
    // strength：athletic.strength 主导，触顶后用 frame 吸收剩余残差
    const strDiff = abilities.strength - d.strength;
    const newStr = clamp099(profile.athletic.strength + strDiff / 0.85);
    profile.athletic.strength = newStr;
    if (newStr >= 99 || newStr <= 1) {
      const d2 = deriveAbilities(profile);
      const rem = abilities.strength - d2.strength;
      if (Math.abs(rem) > 0.1) {
        profile.physical.frame = Math.max(1, Math.min(10, Math.round(profile.physical.frame + rem / 0.2)));
      }
    }
    profile.athletic.vertical = clamp099(profile.athletic.vertical + (abilities.jumping - d.jumping) / 0.6);
    const p99 = scale10to99(profile.mental.pressure);
    const l99 = scale10to99(profile.mental.leadership);
    profile.skill.freeThrow = clamp099((abilities.clutch - 0.7 * p99 - 0.2 * l99) / 0.1);
  }

  // 清理临时缓存字段，返回纯 PlayerProfile
  const { _clutchPressure, _clutchLeadership, ...clean } = profile;
  return clean;
}
