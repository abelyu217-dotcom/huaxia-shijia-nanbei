/**
 * 战术预设库（20 个预设）+ M4 高级战术层
 * 参见：战术系统_预设库与规则语法 §2-§5
 *
 * M4 升级（借鉴 JBL）：
 *   - emphasis 定义与修正表（进攻/防守强调点的 +/- 权衡）
 *   - preset 补全新字段（pace/offenseFocus/ballDistribution/screenDef/closer 等）
 *   - playbook action 库（11 种 Synergy 动作的默认权重 + archetype 倾向）
 */

import {
  DefenseEmphasis,
  OffenseEmphasis,
  PlaybookAction,
  PlayerArchetype,
  TacticModSet,
} from "./types.js";

export interface PresetTactic {
  id: string;
  name: string;
  nameEn: string;
  category: "off" | "def" | "mix" | "spec";
  tempo: "slow" | "mid" | "fast" | "ultra_fast";
  offenseTendency: "outside" | "balanced" | "inside";
  defenseTendency: "press" | "balanced" | "pack";
  desc: string;
  params: Omit<TacticModSet, "teamId">;
}

const baseMod = {
  tendencyMod: { three: 0, midrange: 0, inside: 0, drive: 0, postup: 0 },
  fastBreakChance: 0.15,
  pickRollChance: 0.3,
  defenseContest: 0.2,
  helpDefChance: 0.4,
  stealChance: 0.08,
  possessionTimeDelta: 0,
};

// ─────────────────────────────────────────────────────────────
// M4: Emphasis 修正表（每个强调点 = 一组显式 +/- 系数）
// 用于 sim 引擎在 possession 决策时叠加到能力/概率上。
// 所有数值均为"相对基准的增量"，正数=加成，负数=惩罚。
// ─────────────────────────────────────────────────────────────

export interface EmphasisMods {
  /** 叠加到 tendencyMod（进攻出手倾向） */
  tendency?: Partial<Record<"three" | "midrange" | "inside" | "drive" | "postup", number>>;
  /** 叠加到概率类参数 */
  fastBreakChance?: number;
  pickRollChance?: number;
  defenseContest?: number;
  helpDefChance?: number;
  stealChance?: number;
  possessionTimeDelta?: number;
  /** 进攻篮板概率加成 */
  offRebMod?: number;
  /** 失误概率加成（正=更多失误） */
  turnoverMod?: number;
  /** 快攻失分概率加成（防守方被快攻） */
  fastBreakAllowedMod?: number;
  /** 三分命中率加成 */
  threePctMod?: number;
  /** 筐下命中率加成 */
  rimPctMod?: number;
  /** 中投命中率加成 */
  midPctMod?: number;
  /** 盖帽概率加成 */
  blockMod?: number;
  /** 犯规概率加成（正=更多犯规） */
  foulMod?: number;
  /** 抢断被过风险（正=更易被突破） */
  blownByMod?: number;
  /** 底角三分防守惩罚（正=对手底角三分更准） */
  cornerThreeAllowedMod?: number;
}

/** 进攻强调点修正表 */
export const OFFENSE_EMPHASIS_MODS: Record<OffenseEmphasis, EmphasisMods> = {
  box_out: {
    offRebMod: 0.08,           // +前场篮板
    fastBreakAllowedMod: 0.06, // -退防（被快攻更多）
    possessionTimeDelta: 1,    // 节奏略慢
  },
  early_threes: {
    tendency: { three: 0.2, midrange: -0.1, inside: -0.1 },
    fastBreakChance: 0.08,
    threePctMod: -0.03,        // 转换三分质量下降
    possessionTimeDelta: -2,
  },
  get_to_rim: {
    tendency: { drive: 0.25, inside: 0.15, three: -0.1, postup: -0.05 },
    rimPctMod: 0.02,
    turnoverMod: 0.04,         // 突破风险
    pickRollChance: 0.06,
  },
  midrange_drops: {
    tendency: { midrange: 0.25, inside: -0.15, drive: -0.05 },
    midPctMod: 0.03,
    rimPctMod: -0.02,
  },
  protect_ball: {
    turnoverMod: -0.08,        // 球权安全
    tendency: { three: -0.05, drive: -0.1, inside: -0.05 },
    possessionTimeDelta: 1.5,
    pickRollChance: -0.05,     // 减少复杂配合
  },
};

/** 防守强调点修正表 */
export const DEFENSE_EMPHASIS_MODS: Record<DefenseEmphasis, EmphasisMods> = {
  no_fouls: {
    foulMod: -0.15,
    defenseContest: -0.05,     // 禁区压力下降
    blockMod: -0.04,
  },
  limit_fast_breaks: {
    fastBreakAllowedMod: -0.1,
    offRebMod: -0.05,          // 牺牲前板退防
    stealChance: -0.02,        // 减少 live-ball 压迫
  },
  force_turnovers: {
    stealChance: 0.1,
    defenseContest: 0.05,
    blownByMod: 0.06,          // 被过风险
    foulMod: 0.04,
  },
  protect_rim: {
    blockMod: 0.08,
    helpDefChance: 0.1,
    cornerThreeAllowedMod: 0.05, // 牺牲底角三分
    defenseContest: 0.05,
  },
  limit_perimeter: {
    cornerThreeAllowedMod: -0.05,
    threePctMod: -0.03,        // 对手三分命中率下降
    blownByMod: 0.04,          // 禁区 traffic 下降
  },
};

// ─────────────────────────────────────────────────────────────
// M4: Playbook Action 默认权重库
// 11 种 Synergy 动作的基准分布；教练 signatureActions 会加权。
// 权重为相对值，sim 内会归一化为概率。
// ─────────────────────────────────────────────────────────────

export const DEFAULT_ACTION_WEIGHTS: Record<PlaybookAction, number> = {
  pnr_ball_handler: 1.0,
  pnr_roll_man: 0.7,
  isolation: 0.6,
  post_up: 0.5,
  spot_up: 1.2,
  hand_off: 0.4,
  off_screen: 0.4,
  cut: 0.5,
  transition: 0.9,
  putback: 0.3,
  second_chance: 0.3,
};

/** 教练标志性动作加成倍数 */
export const SIGNATURE_ACTION_BOOST = 1.6;

// ─────────────────────────────────────────────────────────────
// M4: Archetype → Action 倾向
// 不同原型的球员在不同 action 上的相对效率系数（用于 sim 选择 action
// 时偏好球员擅长的动作）。
// ─────────────────────────────────────────────────────────────

export const ARCHETYPE_ACTION_AFFINITY: Record<
  PlayerArchetype,
  Partial<Record<PlaybookAction, number>>
> = {
  post_scorer: { post_up: 1.5, putback: 1.3, second_chance: 1.2, spot_up: 0.6, cut: 0.8 },
  shot_creator: { isolation: 1.4, pnr_ball_handler: 1.3, off_screen: 1.2, spot_up: 0.9 },
  glue_guy: { cut: 1.3, spot_up: 1.2, hand_off: 1.1, isolation: 0.7, post_up: 0.7 },
  play_finisher: { spot_up: 1.3, cut: 1.4, putback: 1.2, pnr_roll_man: 1.1, isolation: 0.8 },
  primary_ballhandler: { pnr_ball_handler: 1.5, isolation: 1.2, hand_off: 1.1, post_up: 0.5 },
  secondary_creator: { pnr_ball_handler: 1.2, hand_off: 1.2, spot_up: 1.1, isolation: 1.0 },
  three_d: { spot_up: 1.4, off_screen: 1.1, cut: 1.0, post_up: 0.5, isolation: 0.7 },
  stretch_big: { spot_up: 1.3, pnr_roll_man: 1.1, post_up: 0.7, cut: 0.8 },
  rim_runner: { pnr_roll_man: 1.4, putback: 1.3, cut: 1.2, spot_up: 0.7, isolation: 0.6 },
  slasher: { cut: 1.4, isolation: 1.2, pnr_ball_handler: 1.1, spot_up: 0.8, post_up: 0.5 },
};

// ─────────────────────────────────────────────────────────────
// 20 个战术预设（已补全 M4 新字段）
// ─────────────────────────────────────────────────────────────

export const PRESET_TACTICS: PresetTactic[] = [
  // ─── 进攻型 ───
  {
    id: "run_and_gun", name: "跑轰战术", nameEn: "Run & Gun", category: "off", tempo: "ultra_fast",
    offenseTendency: "outside", defenseTendency: "press",
    desc: "极速攻防，大量三分，放弃退守换快攻。体能消耗大。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.6, midrange: -0.2, inside: -0.3, drive: 0.2, postup: -0.5 },
      fastBreakChance: 0.35, possessionTimeDelta: -4, defenseContest: -0.1, stealChance: 0.12,
      pace: "faster", offenseFocus: "outside", ballDistribution: "egalitarian",
      offenseFreedom: "freelance", offenseEmphasis: ["early_threes"],
      defenseIntensity: "aggressive", defenseFocus: "perimeter",
      screenDefGuards: "switch", screenDefBigs: "blitz",
      signatureActions: ["transition", "spot_up"],
    },
  },
  {
    id: "seven_seconds", name: "七秒进攻", nameEn: "7 Seconds or Less", category: "off", tempo: "ultra_fast",
    offenseTendency: "outside", defenseTendency: "balanced",
    desc: "纳什太阳式：7秒内完成进攻，高位挡拆+空间拉开。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.4, midrange: 0.1, inside: -0.2, drive: 0.3, postup: -0.4 },
      fastBreakChance: 0.3, pickRollChance: 0.45, possessionTimeDelta: -5,
      pace: "faster", offenseFocus: "pnr", ballDistribution: "heliocentric",
      offenseFreedom: "freelance", offenseEmphasis: ["early_threes", "get_to_rim"],
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "hedge",
      signatureActions: ["pnr_ball_handler", "transition"],
    },
  },
  {
    id: "pace_space", name: "空间与节奏", nameEn: "Pace & Space", category: "off", tempo: "fast",
    offenseTendency: "outside", defenseTendency: "balanced",
    desc: "勇士式：五外站位，无限换防，三分为主。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.5, midrange: -0.1, inside: -0.2, drive: 0.2, postup: -0.4 },
      pickRollChance: 0.35, possessionTimeDelta: -2,
      pace: "faster", offenseFocus: "outside", ballDistribution: "egalitarian",
      offenseFreedom: "freelance", offenseEmphasis: ["early_threes"],
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "switch", screenDefBigs: "hedge",
      signatureActions: ["spot_up", "pnr_ball_handler"],
    },
  },
  {
    id: "motion_offense", name: "动态进攻", nameEn: "Motion Offense", category: "off", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "无固定套路，持续跑动+传导寻找最佳出手。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.1, midrange: 0.15, inside: 0.1, drive: 0.1, postup: 0 },
      pickRollChance: 0.35, possessionTimeDelta: -1,
      pace: "balanced", offenseFocus: "balanced", ballDistribution: "egalitarian",
      offenseFreedom: "freelance",
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "drop",
      signatureActions: ["cut", "off_screen", "hand_off"],
    },
  },
  {
    id: "pick_roll_pop", name: "挡拆外弹", nameEn: "Pick & Pop", category: "off", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "高位挡拆后大个子外弹投三分或中距离。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.2, midrange: 0.3, inside: -0.1, drive: 0.2, postup: -0.1 },
      pickRollChance: 0.5,
      pace: "balanced", offenseFocus: "pnr", ballDistribution: "heliocentric",
      offenseFreedom: "set_plays",
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "hedge",
      signatureActions: ["pnr_ball_handler", "pnr_roll_man", "spot_up"],
    },
  },
  // ─── 防守型 ───
  {
    id: "grind_it_out", name: "绞肉机", nameEn: "Grind It Out", category: "def", tempo: "slow",
    offenseTendency: "inside", defenseTendency: "pack",
    desc: "慢节奏阵地战，收缩内线，磨比分。",
    params: {
      ...baseMod,
      tendencyMod: { three: -0.4, midrange: -0.1, inside: 0.3, drive: 0.1, postup: 0.4 },
      fastBreakChance: 0.05, defenseContest: 0.4, helpDefChance: 0.6, possessionTimeDelta: 5,
      pace: "slower", offenseFocus: "inside", ballDistribution: "heliocentric",
      offenseFreedom: "set_plays", offenseEmphasis: ["protect_ball"],
      defenseIntensity: "conservative", defenseFocus: "interior",
      defenseEmphasis: ["protect_rim", "no_fouls"],
      screenDefGuards: "under", screenDefBigs: "drop",
      signatureActions: ["post_up", "isolation"],
    },
  },
  {
    id: "wall_paint", name: "禁飞区", nameEn: "Wall the Paint", category: "def", tempo: "slow",
    offenseTendency: "inside", defenseTendency: "pack",
    desc: "全力收缩保护禁区，放对手投三分。",
    params: {
      ...baseMod,
      tendencyMod: { three: -0.3, midrange: -0.2, inside: 0.2, drive: -0.2, postup: 0.3 },
      defenseContest: 0.5, helpDefChance: 0.7, stealChance: 0.04, possessionTimeDelta: 3,
      pace: "slower", offenseFocus: "inside", ballDistribution: "heliocentric",
      offenseFreedom: "set_plays",
      defenseIntensity: "conservative", defenseFocus: "interior",
      defenseEmphasis: ["protect_rim"],
      screenDefGuards: "under", screenDefBigs: "drop",
      signatureActions: ["post_up", "putback"],
    },
  },
  {
    id: "full_court_press", name: "全场紧逼", nameEn: "Full Court Press", category: "def", tempo: "fast",
    offenseTendency: "balanced", defenseTendency: "press",
    desc: "全场盯人施压，制造失误打反击。体能消耗极大。",
    params: {
      ...baseMod,
      defenseContest: 0.3, helpDefChance: 0.3, stealChance: 0.2,
      possessionTimeDelta: -2, fastBreakChance: 0.25,
      pace: "faster", offenseFocus: "balanced", ballDistribution: "natural",
      offenseFreedom: "freelance",
      defenseIntensity: "aggressive", defenseFocus: "perimeter",
      defenseEmphasis: ["force_turnovers"],
      screenDefGuards: "switch", screenDefBigs: "blitz",
      signatureActions: ["transition", "spot_up"],
    },
  },
  {
    id: "zone_23", name: "2-3 联防", nameEn: "2-3 Zone", category: "def", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "pack",
    desc: "传统2-3联防，护框强但三分防守弱。",
    params: {
      ...baseMod,
      defenseContest: 0.15, helpDefChance: 0.65, stealChance: 0.06,
      possessionTimeDelta: 1,
      pace: "balanced", offenseFocus: "balanced", ballDistribution: "natural",
      offenseFreedom: "set_plays",
      defenseIntensity: "conservative", defenseFocus: "interior",
      defenseEmphasis: ["protect_rim"],
      screenDefGuards: "under", screenDefBigs: "drop",
      signatureActions: ["spot_up", "cut"],
    },
  },
  {
    id: "switch_everything", name: "无限换防", nameEn: "Switch Everything", category: "def", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "press",
    desc: "所有挡拆换防，消除错位。需要全能防守者。",
    params: {
      ...baseMod,
      defenseContest: 0.25, helpDefChance: 0.2, stealChance: 0.1,
      pickRollChance: 0.2,
      pace: "balanced", offenseFocus: "balanced", ballDistribution: "natural",
      offenseFreedom: "freelance",
      defenseIntensity: "aggressive", defenseFocus: "balanced",
      defenseEmphasis: ["force_turnovers"],
      screenDefGuards: "switch", screenDefBigs: "hedge",
      signatureActions: ["isolation", "spot_up"],
    },
  },
  // ─── 混合型 ───
  {
    id: "twin_engine", name: "双核驱动", nameEn: "Twin Engine", category: "mix", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "两名球星轮番单打，角色球员拉开空间。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.15, midrange: 0.15, inside: 0.1, drive: 0.15, postup: 0.1 },
      pickRollChance: 0.4, possessionTimeDelta: 0,
      pace: "balanced", offenseFocus: "balanced", ballDistribution: "heliocentric",
      offenseFreedom: "freelance",
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "hedge",
      signatureActions: ["isolation", "pnr_ball_handler"],
    },
  },
  {
    id: "inside_out", name: "内外结合", nameEn: "Inside Out", category: "mix", tempo: "mid",
    offenseTendency: "inside", defenseTendency: "balanced",
    desc: "先喂内线，吸引包夹后分球外线投三分。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.2, midrange: -0.1, inside: 0.3, drive: 0, postup: 0.3 },
      pickRollChance: 0.3, possessionTimeDelta: 1,
      pace: "balanced", offenseFocus: "inside", ballDistribution: "heliocentric",
      offenseFreedom: "set_plays",
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "drop",
      signatureActions: ["post_up", "spot_up"],
    },
  },
  {
    id: "jumbo", name: "巨无霸", nameEn: "Jumbo Lineup", category: "mix", tempo: "slow",
    offenseTendency: "inside", defenseTendency: "pack",
    desc: "大个子阵容，碾压内线，篮板统治。",
    params: {
      ...baseMod,
      tendencyMod: { three: -0.3, midrange: -0.1, inside: 0.3, drive: -0.1, postup: 0.5 },
      defenseContest: 0.3, possessionTimeDelta: 3,
      pace: "slower", offenseFocus: "bully", ballDistribution: "heliocentric",
      offenseFreedom: "set_plays", offenseEmphasis: ["box_out"],
      defenseIntensity: "conservative", defenseFocus: "interior",
      defenseEmphasis: ["protect_rim"],
      screenDefGuards: "under", screenDefBigs: "drop",
      signatureActions: ["post_up", "putback", "second_chance"],
    },
  },
  {
    id: "small_ball", name: "死亡五小", nameEn: "Small Ball Death", category: "mix", tempo: "fast",
    offenseTendency: "outside", defenseTendency: "press",
    desc: "五小阵容，无限换防+三分雨。体能要求极高。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.4, midrange: 0.1, inside: -0.2, drive: 0.3, postup: -0.5 },
      fastBreakChance: 0.25, defenseContest: 0.1, stealChance: 0.12, possessionTimeDelta: -3,
      pace: "faster", offenseFocus: "outside", ballDistribution: "egalitarian",
      offenseFreedom: "freelance", offenseEmphasis: ["early_threes", "get_to_rim"],
      defenseIntensity: "aggressive", defenseFocus: "perimeter",
      defenseEmphasis: ["force_turnovers"],
      screenDefGuards: "switch", screenDefBigs: "hedge",
      signatureActions: ["spot_up", "transition", "isolation"],
    },
  },
  {
    id: "iso_heavy", name: "单打王", nameEn: "Iso Heavy", category: "mix", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "球星单打为主，少传球，靠个人能力终结。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.1, midrange: 0.2, inside: 0.1, drive: 0.2, postup: 0.15 },
      pickRollChance: 0.15, possessionTimeDelta: 2,
      pace: "balanced", offenseFocus: "balanced", ballDistribution: "heliocentric",
      offenseFreedom: "freelance",
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "hedge",
      signatureActions: ["isolation", "post_up"],
    },
  },
  // ─── 特殊型 ───
  {
    id: "hack_a_shaq", name: "砍鲨战术", nameEn: "Hack-a-Shaq", category: "spec", tempo: "slow",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "故意犯规送对方罚球差的球员上罚球线。",
    params: {
      ...baseMod,
      possessionTimeDelta: 3,
      pace: "slower", offenseFocus: "balanced", ballDistribution: "natural",
      offenseFreedom: "set_plays",
      defenseIntensity: "aggressive", defenseFocus: "interior",
      defenseEmphasis: ["no_fouls"],
      screenDefGuards: "under", screenDefBigs: "drop",
      signatureActions: ["isolation"],
    },
  },
  {
    id: "four_factors", name: "四要素", nameEn: "Four Factors", category: "spec", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "追求有效命中率、失误控制、进攻篮板、罚球率的最优平衡。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.1, midrange: 0.1, inside: 0.1, drive: 0.1, postup: 0 },
      defenseContest: 0.2, stealChance: 0.1, possessionTimeDelta: 0,
      pace: "balanced", offenseFocus: "balanced", ballDistribution: "egalitarian",
      offenseFreedom: "set_plays", offenseEmphasis: ["protect_ball", "box_out"],
      defenseIntensity: "balanced", defenseFocus: "balanced",
      defenseEmphasis: ["limit_fast_breaks"],
      screenDefGuards: "over", screenDefBigs: "hedge",
      signatureActions: ["spot_up", "pnr_ball_handler"],
    },
  },
  {
    id: "clutch_iso", name: "关键单打", nameEn: "Clutch Iso", category: "spec", tempo: "slow",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "最后时刻交给球星单打，消耗时间求最后一击。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.1, midrange: 0.2, inside: 0.1, drive: 0.2, postup: 0.1 },
      pickRollChance: 0.2, possessionTimeDelta: 6,
      pace: "slower", offenseFocus: "balanced", ballDistribution: "heliocentric",
      offenseFreedom: "freelance", offenseEmphasis: ["protect_ball"],
      defenseIntensity: "conservative", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "hedge",
      signatureActions: ["isolation", "pnr_ball_handler"],
    },
  },
  {
    id: "draw_and_kick", name: "突分体系", nameEn: "Draw & Kick", category: "spec", tempo: "mid",
    offenseTendency: "outside", defenseTendency: "balanced",
    desc: "突破吸引防守后分球外线射手，现代篮球核心套路。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0.3, midrange: 0, inside: -0.1, drive: 0.4, postup: -0.3 },
      pickRollChance: 0.4,
      pace: "balanced", offenseFocus: "drive", ballDistribution: "heliocentric",
      offenseFreedom: "freelance", offenseEmphasis: ["get_to_rim"],
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "hedge",
      signatureActions: ["pnr_ball_handler", "spot_up", "isolation"],
    },
  },
  {
    id: "post_triangle", name: "三角进攻", nameEn: "Triangle Offense", category: "spec", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "乔丹公牛/科比湖人体系：三角站位创造单打空间。",
    params: {
      ...baseMod,
      tendencyMod: { three: 0, midrange: 0.2, inside: 0.1, drive: 0, postup: 0.25 },
      pickRollChance: 0.2, possessionTimeDelta: 1,
      pace: "balanced", offenseFocus: "balanced", ballDistribution: "egalitarian",
      offenseFreedom: "set_plays",
      defenseIntensity: "balanced", defenseFocus: "balanced",
      screenDefGuards: "over", screenDefBigs: "hedge",
      signatureActions: ["post_up", "isolation", "off_screen", "cut"],
    },
  },
];

export function getPresetById(id: string): PresetTactic | undefined {
  return PRESET_TACTICS.find((p) => p.id === id);
}

export function tacticFromPreset(teamId: string, presetId: string): TacticModSet {
  const preset = getPresetById(presetId) ?? PRESET_TACTICS[0]!;
  return { teamId, ...preset.params };
}

// ─────────────────────────────────────────────────────────────
// M4: 默认值填充工具
// sim / API 层在拿到用户战术配置时，可能只有部分新字段；用此函数
// 把缺失的字段补上默认值，确保引擎逻辑稳定。
// ─────────────────────────────────────────────────────────────

export function fillTacticDefaults(tactic: TacticModSet): TacticModSet {
  return {
    ...tactic,
    pace: tactic.pace ?? "balanced",
    offenseFocus: tactic.offenseFocus ?? "balanced",
    ballDistribution: tactic.ballDistribution ?? "natural",
    offenseFreedom: tactic.offenseFreedom ?? "freelance",
    offenseEmphasis: tactic.offenseEmphasis ?? [],
    defenseIntensity: tactic.defenseIntensity ?? "balanced",
    defenseFocus: tactic.defenseFocus ?? "balanced",
    screenDefGuards: tactic.screenDefGuards ?? "over",
    screenDefBigs: tactic.screenDefBigs ?? "drop",
    defenseEmphasis: tactic.defenseEmphasis ?? [],
    signatureActions: tactic.signatureActions ?? [],
    familiarity: tactic.familiarity ?? {},
    actionWeights: tactic.actionWeights ?? { ...DEFAULT_ACTION_WEIGHTS },
    endGameStrategies: tactic.endGameStrategies ?? {},
  };
}

/** 合并所有 emphasis 修正为一个 EmphasisMods（进攻+防守） */
export function combineEmphasisMods(
  offense: OffenseEmphasis[],
  defense: DefenseEmphasis[],
): EmphasisMods {
  const merged: EmphasisMods = {};
  const add = (m: EmphasisMods) => {
    if (m.tendency) {
      merged.tendency = merged.tendency ?? {};
      for (const k of Object.keys(m.tendency) as Array<keyof NonNullable<EmphasisMods["tendency"]>>) {
        merged.tendency[k] = (merged.tendency[k] ?? 0) + (m.tendency[k] ?? 0);
      }
    }
    for (const key of Object.keys(m) as Array<keyof EmphasisMods>) {
      if (key === "tendency") continue;
      const v = m[key];
      if (typeof v === "number") {
        (merged as Record<string, number>)[key] = ((merged as Record<string, number>)[key] ?? 0) + v;
      }
    }
  };
  for (const e of offense) add(OFFENSE_EMPHASIS_MODS[e]);
  for (const e of defense) add(DEFENSE_EMPHASIS_MODS[e]);
  return merged;
}
