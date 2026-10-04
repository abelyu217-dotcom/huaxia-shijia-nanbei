/**
 * 测试用 mock 工厂——生成可用的球员/球队/对阵数据
 */

import {
  Abilities,
  DEFAULT_CONFIG,
  Lineup,
  Matchup,
  Player,
  SimInput,
  Team,
  TacticModSet,
} from "../src/index.js";

function defaultAbilities(overrides: Partial<Abilities> = {}): Abilities {
  return {
    three: 70, midrange: 75, inside: 70, drive: 72, postup: 65,
    passing: 78, ballHandle: 76,
    perimeterD: 73, interiorD: 71, steal: 65, block: 60,
    speed: 75, strength: 72, jumping: 74, stamina: 80,
    iq: 77, clutch: 70,
    ...overrides,
  };
}

function makePlayer(id: string, name: string, position: Player["position"], abilities: Partial<Abilities> = {}): Player {
  const ab = defaultAbilities(abilities);
  // 基于能力分配特质（与 generators.ts 逻辑保持一致）
  const traits: string[] = [];
  if ((position === "SG" || position === "SF") && ab.three >= 70) traits.push("sharpshooter");
  if ((position === "PF" || position === "C") && ab.inside >= 70) traits.push("interior_monster");
  if (position === "PG" && ab.passing >= 75) traits.push("playmaker");
  if (ab.stamina >= 85) traits.push("iron_man");
  if (ab.clutch >= 75) traits.push("clutch_performer");
  return {
    id,
    name,
    position,
    abilities: ab,
    condition: { fatigue: 0, foulTrouble: 0, hot: 0 },
    traits,
  };
}

function defaultTactic(teamId: string, overrides: Partial<TacticModSet> = {}): TacticModSet {
  return {
    teamId,
    tendencyMod: { three: 0, midrange: 0, inside: 0, drive: 0, postup: 0 },
    fastBreakChance: 0.15,
    pickRollChance: 0.3,
    defenseContest: 0.2,
    helpDefChance: 0.4,
    stealChance: 0.08,
    possessionTimeDelta: 0,
    ...overrides,
  };
}

function makeTeam(teamId: string, teamName: string, playerNames: string[]): Team {
  const positions: Player["position"][] = ["PG", "SG", "SF", "PF", "C"];
  const players = playerNames.map((n, i) => makePlayer(`${teamId}-p${i + 1}`, n, positions[i]!));
  // 替补：5 名角色球员（能力略低）
  const benchNames = ["林替补1", "林替补2", "林替补3", "林替补4", "林替补5"];
  for (let i = 0; i < 5; i++) {
    players.push(
      makePlayer(`${teamId}-b${i + 1}`, benchNames[i]!, positions[i]!, {
        three: 60, midrange: 62, inside: 58, drive: 60, postup: 55,
        passing: 62, ballHandle: 60,
        perimeterD: 62, interiorD: 60, steal: 55, block: 50,
        speed: 68, strength: 65, jumping: 65, stamina: 75,
        iq: 65, clutch: 60,
      }),
    );
  }
  const lineup: Lineup = {
    starters: players.slice(0, 5).map((p) => p.id),
    minutes: Object.fromEntries(
      players.map((p, i) => [p.id, i < 5 ? 32 : 16]),
    ),
  };
  return {
    id: teamId,
    name: teamName,
    players,
    lineup,
    tactic: defaultTactic(teamId),
    chemistry: 60,
  };
}

export function makeMockMatchup(): Matchup {
  const home = makeTeam("home", "主场队", ["张伟", "李强", "王磊", "赵刚", "孙浩"]);
  const away = makeTeam("away", "客场队", ["陈明", "刘洋", "杨光", "黄涛", "周杰"]);
  return { homeTeam: home, awayTeam: away };
}

export function makeMockInput(seed = 12345): SimInput {
  return {
    matchup: makeMockMatchup(),
    seed,
    config: DEFAULT_CONFIG,
  };
}
