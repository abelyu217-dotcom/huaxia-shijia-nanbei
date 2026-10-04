/**
 * 测试共享 mock 数据与工具
 */
import type {
  Facility,
  ScheduleDay,
  SeasonInfo,
  SimOutput,
  TacticPreset,
  TeamRoster,
} from "../src/types";

export const myTeamId = "team-me";

export function makeTeam(
  id: string,
  name: string,
  ovr: number,
): TeamRoster {
  return {
    id,
    name,
    players: [
      { id: `${id}-p1`, name: `${name} Player1`, position: "PG", ovr },
      { id: `${id}-p2`, name: `${name} Player2`, position: "SG", ovr: ovr - 2 },
      { id: `${id}-p3`, name: `${name} Player3`, position: "SF", ovr: ovr - 1 },
    ],
  };
}

export const mockTeams: TeamRoster[] = [
  makeTeam(myTeamId, "我的球队", 80),
  makeTeam("team-a", "阿尔法队", 85),
  makeTeam("team-b", "贝塔队", 75),
];

export const mockTactics: TacticPreset[] = [
  {
    id: "pace_space",
    name: "跑轰空间",
    nameEn: "",
    category: "offense",
    tempo: "fast",
    offenseTendency: "pace",
    defenseTendency: "man",
    desc: "",
  } as unknown as TacticPreset,
];

export const mockFacility: Facility = {
  teamId: myTeamId,
  trainingHallLv: 2,
  arenaLv: 1,
  trainingMultiplier: 1.2,
  arenaRevenueMultiplier: 1.1,
  homeAdvantageBonus: 1.5,
  upgrades: {
    trainingHall: { cost: 5000, nextMultiplier: 1.3 },
    arena: { cost: 8000, nextRevenue: 1.2, nextHomeBonus: 2.0 },
  },
};

export const maxedFacility: Facility = {
  teamId: myTeamId,
  trainingHallLv: 10,
  arenaLv: 10,
  trainingMultiplier: 2.0,
  arenaRevenueMultiplier: 2.0,
  homeAdvantageBonus: 5.0,
  upgrades: {
    trainingHall: { cost: null, nextMultiplier: null },
    arena: { cost: null, nextRevenue: null, nextHomeBonus: null },
  },
};

export function makeSimOutput(homeScore: number, awayScore: number): SimOutput {
  const winner = homeScore >= awayScore ? "home" : "away";
  return {
    result: {
      homeScore,
      awayScore,
      winnerId: winner === "home" ? myTeamId : "team-a",
      isClutch: Math.abs(homeScore - awayScore) <= 3,
    },
    boxScore: {
      home: { score: homeScore, players: [] },
      away: { score: awayScore, players: [] },
    },
    quarterScores: { home: [], away: [] },
    pbp: [],
    seed: 1,
  } as SimOutput;
}

export const mockSeason: SeasonInfo = {
  id: "s1",
  name: "S1 赛季",
  year: 2025,
  status: "regular",
  currentDay: 5,
};

export const mockSchedule: ScheduleDay[] = [
  {
    day: 1,
    matches: [
      {
        id: "m1",
        homeTeamId: myTeamId,
        homeTeamName: "我的球队",
        awayTeamId: "team-a",
        awayTeamName: "阿尔法队",
        status: "final",
        homeScore: 100,
        awayScore: 95,
        winnerId: myTeamId,
      },
    ],
  },
];
