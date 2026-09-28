/**
 * 战术预设库（20 个预设）
 * 参见：战术系统_预设库与规则语法 §2-§5
 */

import { TacticModSet } from "./types.js";

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

export const PRESET_TACTICS: PresetTactic[] = [
  // ─── 进攻型 ───
  {
    id: "run_and_gun", name: "跑轰战术", nameEn: "Run & Gun", category: "off", tempo: "ultra_fast",
    offenseTendency: "outside", defenseTendency: "press",
    desc: "极速攻防，大量三分，放弃退守换快攻。体能消耗大。",
    params: { ...baseMod, tendencyMod: { three: 0.6, midrange: -0.2, inside: -0.3, drive: 0.2, postup: -0.5 },
      fastBreakChance: 0.35, possessionTimeDelta: -4, defenseContest: -0.1, stealChance: 0.12 },
  },
  {
    id: "seven_seconds", name: "七秒进攻", nameEn: "7 Seconds or Less", category: "off", tempo: "ultra_fast",
    offenseTendency: "outside", defenseTendency: "balanced",
    desc: "纳什太阳式：7秒内完成进攻，高位挡拆+空间拉开。",
    params: { ...baseMod, tendencyMod: { three: 0.4, midrange: 0.1, inside: -0.2, drive: 0.3, postup: -0.4 },
      fastBreakChance: 0.3, pickRollChance: 0.45, possessionTimeDelta: -5 },
  },
  {
    id: "pace_space", name: "空间与节奏", nameEn: "Pace & Space", category: "off", tempo: "fast",
    offenseTendency: "outside", defenseTendency: "balanced",
    desc: "勇士式：五外站位，无限换防，三分为主。",
    params: { ...baseMod, tendencyMod: { three: 0.5, midrange: -0.1, inside: -0.2, drive: 0.2, postup: -0.4 },
      pickRollChance: 0.35, possessionTimeDelta: -2 },
  },
  {
    id: "motion_offense", name: "动态进攻", nameEn: "Motion Offense", category: "off", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "无固定套路，持续跑动+传导寻找最佳出手。",
    params: { ...baseMod, tendencyMod: { three: 0.1, midrange: 0.15, inside: 0.1, drive: 0.1, postup: 0 },
      pickRollChance: 0.35, possessionTimeDelta: -1 },
  },
  {
    id: "pick_roll_pop", name: "挡拆外弹", nameEn: "Pick & Pop", category: "off", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "高位挡拆后大个子外弹投三分或中距离。",
    params: { ...baseMod, tendencyMod: { three: 0.2, midrange: 0.3, inside: -0.1, drive: 0.2, postup: -0.1 },
      pickRollChance: 0.5 },
  },
  // ─── 防守型 ───
  {
    id: "grind_it_out", name: "绞肉机", nameEn: "Grind It Out", category: "def", tempo: "slow",
    offenseTendency: "inside", defenseTendency: "pack",
    desc: "慢节奏阵地战，收缩内线，磨比分。",
    params: { ...baseMod, tendencyMod: { three: -0.4, midrange: -0.1, inside: 0.3, drive: 0.1, postup: 0.4 },
      fastBreakChance: 0.05, defenseContest: 0.4, helpDefChance: 0.6, possessionTimeDelta: 5 },
  },
  {
    id: "wall_paint", name: "禁飞区", nameEn: "Wall the Paint", category: "def", tempo: "slow",
    offenseTendency: "inside", defenseTendency: "pack",
    desc: "全力收缩保护禁区，放对手投三分。",
    params: { ...baseMod, tendencyMod: { three: -0.3, midrange: -0.2, inside: 0.2, drive: -0.2, postup: 0.3 },
      defenseContest: 0.5, helpDefChance: 0.7, stealChance: 0.04, possessionTimeDelta: 3 },
  },
  {
    id: "full_court_press", name: "全场紧逼", nameEn: "Full Court Press", category: "def", tempo: "fast",
    offenseTendency: "balanced", defenseTendency: "press",
    desc: "全场盯人施压，制造失误打反击。体能消耗极大。",
    params: { ...baseMod, defenseContest: 0.3, helpDefChance: 0.3, stealChance: 0.2,
      possessionTimeDelta: -2, fastBreakChance: 0.25 },
  },
  {
    id: "zone_23", name: "2-3 联防", nameEn: "2-3 Zone", category: "def", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "pack",
    desc: "传统2-3联防，护框强但三分防守弱。",
    params: { ...baseMod, defenseContest: 0.15, helpDefChance: 0.65, stealChance: 0.06,
      possessionTimeDelta: 1 },
  },
  {
    id: "switch_everything", name: "无限换防", nameEn: "Switch Everything", category: "def", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "press",
    desc: "所有挡拆换防，消除错位。需要全能防守者。",
    params: { ...baseMod, defenseContest: 0.25, helpDefChance: 0.2, stealChance: 0.1,
      pickRollChance: 0.2 },
  },
  // ─── 混合型 ───
  {
    id: "twin_engine", name: "双核驱动", nameEn: "Twin Engine", category: "mix", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "两名球星轮番单打，角色球员拉开空间。",
    params: { ...baseMod, tendencyMod: { three: 0.15, midrange: 0.15, inside: 0.1, drive: 0.15, postup: 0.1 },
      pickRollChance: 0.4, possessionTimeDelta: 0 },
  },
  {
    id: "inside_out", name: "内外结合", nameEn: "Inside Out", category: "mix", tempo: "mid",
    offenseTendency: "inside", defenseTendency: "balanced",
    desc: "先喂内线，吸引包夹后分球外线投三分。",
    params: { ...baseMod, tendencyMod: { three: 0.2, midrange: -0.1, inside: 0.3, drive: 0, postup: 0.3 },
      pickRollChance: 0.3, possessionTimeDelta: 1 },
  },
  {
    id: "jumbo", name: "巨无霸", nameEn: "Jumbo Lineup", category: "mix", tempo: "slow",
    offenseTendency: "inside", defenseTendency: "pack",
    desc: "大个子阵容，碾压内线，篮板统治。",
    params: { ...baseMod, tendencyMod: { three: -0.3, midrange: -0.1, inside: 0.3, drive: -0.1, postup: 0.5 },
      defenseContest: 0.3, possessionTimeDelta: 3 },
  },
  {
    id: "small_ball", name: "死亡五小", nameEn: "Small Ball Death", category: "mix", tempo: "fast",
    offenseTendency: "outside", defenseTendency: "press",
    desc: "五小阵容，无限换防+三分雨。体能要求极高。",
    params: { ...baseMod, tendencyMod: { three: 0.4, midrange: 0.1, inside: -0.2, drive: 0.3, postup: -0.5 },
      fastBreakChance: 0.25, defenseContest: 0.1, stealChance: 0.12, possessionTimeDelta: -3 },
  },
  {
    id: "iso_heavy", name: "单打王", nameEn: "Iso Heavy", category: "mix", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "球星单打为主，少传球，靠个人能力终结。",
    params: { ...baseMod, tendencyMod: { three: 0.1, midrange: 0.2, inside: 0.1, drive: 0.2, postup: 0.15 },
      pickRollChance: 0.15, possessionTimeDelta: 2 },
  },
  // ─── 特殊型 ───
  {
    id: "hack_a_shaq", name: "砍鲨战术", nameEn: "Hack-a-Shaq", category: "spec", tempo: "slow",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "故意犯规送对方罚球差的球员上罚球线。",
    params: { ...baseMod, possessionTimeDelta: 3 },
  },
  {
    id: "four_factors", name: "四要素", nameEn: "Four Factors", category: "spec", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "追求有效命中率、失误控制、进攻篮板、罚球率的最优平衡。",
    params: { ...baseMod, tendencyMod: { three: 0.1, midrange: 0.1, inside: 0.1, drive: 0.1, postup: 0 },
      defenseContest: 0.2, stealChance: 0.1, possessionTimeDelta: 0 },
  },
  {
    id: "clutch_iso", name: "关键单打", nameEn: "Clutch Iso", category: "spec", tempo: "slow",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "最后时刻交给球星单打，消耗时间求最后一击。",
    params: { ...baseMod, tendencyMod: { three: 0.1, midrange: 0.2, inside: 0.1, drive: 0.2, postup: 0.1 },
      pickRollChance: 0.2, possessionTimeDelta: 6 },
  },
  {
    id: "draw_and_kick", name: "突分体系", nameEn: "Draw & Kick", category: "spec", tempo: "mid",
    offenseTendency: "outside", defenseTendency: "balanced",
    desc: "突破吸引防守后分球外线射手，现代篮球核心套路。",
    params: { ...baseMod, tendencyMod: { three: 0.3, midrange: 0, inside: -0.1, drive: 0.4, postup: -0.3 },
      pickRollChance: 0.4 },
  },
  {
    id: "post_triangle", name: "三角进攻", nameEn: "Triangle Offense", category: "spec", tempo: "mid",
    offenseTendency: "balanced", defenseTendency: "balanced",
    desc: "乔丹公牛/科比湖人体系：三角站位创造单打空间。",
    params: { ...baseMod, tendencyMod: { three: 0, midrange: 0.2, inside: 0.1, drive: 0, postup: 0.25 },
      pickRollChance: 0.2, possessionTimeDelta: 1 },
  },
];

export function getPresetById(id: string): PresetTactic | undefined {
  return PRESET_TACTICS.find((p) => p.id === id);
}

export function tacticFromPreset(teamId: string, presetId: string): TacticModSet {
  const preset = getPresetById(presetId) ?? PRESET_TACTICS[0]!;
  return { teamId, ...preset.params };
}
