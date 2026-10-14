/**
 * sim 控制器用 mock 对阵工厂
 *
 * 参考 packages/shared/tests/mock.ts 的模式，但独立实现——
 * 2 队各 5 球员，构造可用的 Matchup。
 */

import {
  Abilities,
  Lineup,
  Matchup,
  Player,
  Position,
  TacticModSet,
  Team,
} from "@hwo/shared";

function defaultAbilities(overrides: Partial<Abilities> = {}): Abilities {
  return {
    three: 70,
    midrange: 75,
    inside: 70,
    drive: 72,
    postup: 65,
    passing: 78,
    ballHandle: 76,
    perimeterD: 73,
    interiorD: 71,
    steal: 65,
    block: 60,
    speed: 75,
    strength: 72,
    jumping: 74,
    stamina: 80,
    iq: 77,
    clutch: 70,
    ...overrides,
  };
}

function makePlayer(
  id: string,
  name: string,
  position: Position,
  abilities: Partial<Abilities> = {},
): Player {
  return {
    id,
    name,
    position,
    abilities: defaultAbilities(abilities),
    condition: { fatigue: 0, foulTrouble: 0, hot: 0 },
    traits: [],
  };
}

function defaultTactic(teamId: string): TacticModSet {
  return {
    teamId,
    tendencyMod: { three: 0, midrange: 0, inside: 0, drive: 0, postup: 0 },
    fastBreakChance: 0.15,
    pickRollChance: 0.3,
    defenseContest: 0.2,
    helpDefChance: 0.4,
    stealChance: 0.08,
    possessionTimeDelta: 0,
  };
}

function makeTeam(teamId: string, teamName: string, playerNames: string[]): Team {
  const positions: Position[] = ["PG", "SG", "SF", "PF", "C"];
  const players = playerNames.map((n, i) =>
    makePlayer(`${teamId}-p${i + 1}`, n, positions[i]!),
  );
  const lineup: Lineup = {
    starters: players.map((p) => p.id),
    minutes: Object.fromEntries(players.map((p) => [p.id, 32])),
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
  const home = makeTeam("home", "主场队", [
    "张伟",
    "李强",
    "王磊",
    "赵刚",
    "孙浩",
  ]);
  const away = makeTeam("away", "客场队", [
    "陈明",
    "刘洋",
    "杨光",
    "黄涛",
    "周杰",
  ]);
  return { homeTeam: home, awayTeam: away };
}
