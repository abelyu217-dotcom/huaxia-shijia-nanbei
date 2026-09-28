/**
 * 球员与球队生成器
 * 生成有真实感的球员数据用于 MVP 演示
 */

import { Abilities, Player, Position, Team, Lineup } from "./types.js";

// 姓氏池
const SURNAMES = ["王", "李", "张", "刘", "陈", "杨", "黄", "赵", "周", "吴",
  "徐", "孙", "马", "朱", "胡", "郭", "林", "何", "高", "罗",
  "郑", "梁", "谢", "宋", "唐", "许", "韩", "冯", "邓", "曹"];

// 名字池
const GIVEN_NAMES = ["伟", "强", "磊", "洋", "勇", "军", "杰", "涛", "明", "超",
  "鹏", "斌", "波", "宇", "辉", "凯", "晨", "昊", "翔", "旭",
  "子轩", "浩然", "俊杰", "嘉伟", "思远", "梓涵", "雨泽", "博文", "启航", "天佑",
  "一鸣", "子墨", "沐阳", "承恩", "彦霖", "锦程", "逸飞", "景行", "维康", "怀瑾"];

function rngFromSeed(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// 按位置生成能力值分布
function generateAbilities(position: Position, tier: number, rng: () => number): Abilities {
  // tier: 0=角色球员(60-72), 1=首发(68-80), 2=全明星(78-90), 3=超级巨星(85-95)
  const ranges = [
    [58, 72], [66, 80], [76, 90], [84, 95],
  ];
  const [lo, hi] = ranges[tier] ?? [60, 72];

  const base = () => randInt(lo, hi, rng);
  const weak = () => randInt(Math.max(40, lo - 15), lo + 5, rng);
  const strong = () => randInt(hi - 5, Math.min(99, hi + 8), rng);

  switch (position) {
    case "PG":
      return {
        three: base(), midrange: base(), inside: weak(), drive: strong(),
        postup: weak(), passing: strong(), ballHandle: strong(),
        perimeterD: base(), interiorD: weak(), steal: strong(), block: weak(),
        speed: strong(), strength: weak(), jumping: base(), stamina: base(),
        iq: strong(), clutch: base(),
      };
    case "SG":
      return {
        three: strong(), midrange: strong(), inside: base(), drive: base(),
        postup: weak(), passing: base(), ballHandle: base(),
        perimeterD: base(), interiorD: weak(), steal: base(), block: weak(),
        speed: strong(), strength: base(), jumping: base(), stamina: base(),
        iq: base(), clutch: strong(),
      };
    case "SF":
      return {
        three: base(), midrange: base(), inside: base(), drive: base(),
        postup: base(), passing: base(), ballHandle: base(),
        perimeterD: base(), interiorD: base(), steal: base(), block: base(),
        speed: base(), strength: base(), jumping: base(), stamina: strong(),
        iq: base(), clutch: base(),
      };
    case "PF":
      return {
        three: weak(), midrange: base(), inside: strong(), drive: weak(),
        postup: strong(), passing: weak(), ballHandle: weak(),
        perimeterD: weak(), interiorD: strong(), steal: weak(), block: strong(),
        speed: weak(), strength: strong(), jumping: strong(), stamina: base(),
        iq: base(), clutch: base(),
      };
    case "C":
      return {
        three: weak(), midrange: weak(), inside: strong(), drive: weak(),
        postup: strong(), passing: weak(), ballHandle: weak(),
        perimeterD: weak(), interiorD: strong(), steal: weak(), block: strong(),
        speed: weak(), strength: strong(), jumping: strong(), stamina: base(),
        iq: base(), clutch: base(),
      };
  }
}

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

function generatePlayer(id: string, position: Position, tier: number, seed: number): Player {
  const rng = rngFromSeed(seed);
  const name = pick(SURNAMES, rng) + pick(GIVEN_NAMES, rng);
  return {
    id,
    name,
    position,
    abilities: generateAbilities(position, tier, rng),
    condition: { fatigue: 0, foulTrouble: 0, hot: 0 },
    traits: [],
  };
}

const TEAM_NAMES = [
  { id: "tigers", name: "东方猛虎", city: "上海" },
  { id: "dragons", name: "南方飞龙", city: "广州" },
  { id: "eagles", name: "北方雄鹰", city: "北京" },
  { id: "wolves", name: "西部群狼", city: "成都" },
  { id: "sharks", name: "海岸鲨鱼", city: "深圳" },
  { id: "thunder", name: "高原雷霆", city: "昆明" },
];

/**
 * 生成一支球队：5 首发（tier 1-3 混合）+ 5 替补（tier 0-1）
 */
export function generateTeam(teamIndex: number, seed: number): Team {
  const teamInfo = TEAM_NAMES[teamIndex % TEAM_NAMES.length]!;
  const rng = rngFromSeed(seed + teamIndex * 1000);

  const players: Player[] = [];
  // 首发：随机一个位置为巨星(3)，可能一个全明星(2)，其余首发级(1)
  const rng2 = rngFromSeed(seed + teamIndex * 9999);
  const tiers = [1, 1, 1, 1, 1];
  tiers[randInt(0, 4, rng2)] = 2;
  if (rng2() > 0.5) tiers[randInt(0, 4, rng2)] = 3;

  for (let i = 0; i < 5; i++) {
    players.push(generatePlayer(`${teamInfo.id}-s${i + 1}`, POSITIONS[i]!, tiers[i]!, seed + i));
  }
  // 替补：5 个角色球员/首发级
  for (let i = 0; i < 5; i++) {
    const tier = rng() > 0.6 ? 1 : 0;
    players.push(generatePlayer(`${teamInfo.id}-b${i + 1}`, POSITIONS[i]!, tier, seed + 100 + i));
  }

  const starters = players.slice(0, 5).map((p) => p.id);
  const minutes: Record<string, number> = {};
  // 首发每人 32-36 分钟，替补 12-18 分钟
  players.slice(0, 5).forEach((p) => { minutes[p.id] = randInt(32, 36, rng); });
  players.slice(5).forEach((p) => { minutes[p.id] = randInt(10, 18, rng); });

  const lineup: Lineup = { starters, minutes };

  return {
    id: teamInfo.id,
    name: `${teamInfo.city}${teamInfo.name}`,
    players,
    lineup,
    tactic: {
      teamId: teamInfo.id,
      tendencyMod: { three: 0, midrange: 0, inside: 0, drive: 0, postup: 0 },
      fastBreakChance: 0.15, pickRollChance: 0.3, defenseContest: 0.2,
      helpDefChance: 0.4, stealChance: 0.08, possessionTimeDelta: 0,
    },
    chemistry: randInt(50, 70, rng),
  };
}

/**
 * 生成全部 6 支球队
 */
export function generateAllTeams(seed = 42): Team[] {
  return TEAM_NAMES.map((_, i) => generateTeam(i, seed));
}

/**
 * 能力值综合评分（用于排序展示）
 */
export function overallRating(abilities: Abilities): number {
  const a = abilities;
  const offense = (a.three + a.midrange + a.inside + a.drive + a.postup + a.ballHandle + a.passing) / 7;
  const defense = (a.perimeterD + a.interiorD + a.steal + a.block) / 4;
  const body = (a.speed + a.strength + a.jumping + a.stamina) / 4;
  const mental = (a.iq + a.clutch) / 2;
  return Math.round(offense * 0.4 + defense * 0.25 + body * 0.2 + mental * 0.15);
}
