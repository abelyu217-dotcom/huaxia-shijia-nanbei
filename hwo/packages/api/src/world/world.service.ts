/**
 * WorldService——多玩家世界生成与管理
 *
 * M2：每个世界包含 16 支球队，分 L1（顶级）/ L2（次级）两级联赛。
 * 世界内经济封闭，跨世界不可交易。
 *
 * 职责：
 * 1. createWorld: 创建世界 + 16 支球队 + L1/L2 联赛 + 赛程
 * 2. listWorlds: 列出所有世界
 * 3. getWorld: 查询世界详情（含球队、联赛、积分榜）
 * 4. joinWorld: 玩家加入世界（认领一支 AI 球队）
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { generateAllTeams, tacticFromPreset, type Team } from "@hwo/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { ScheduleService } from "../season/schedule.service.js";
import { SeasonService } from "../season/season.service.js";

const WORLD_TEAM_COUNT = 16;
const L1_TEAM_COUNT = 8;
const L2_TEAM_COUNT = 8;

@Injectable()
export class WorldService {
  private readonly logger = new Logger(WorldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly seasonService: SeasonService,
  ) {}

  /**
   * 创建一个新世界：
   * 1. 创建 Season（若不存在则创建）
   * 2. 创建 World 记录
   * 3. 创建 L1 / L2 两个联赛
   * 4. 生成 16 支球队（含球员、阵容、战术），前 8 入 L1，后 8 入 L2
   * 5. 为每支球队创建 Standing 记录
   * 6. 为两个联赛生成赛程
   */
  async createWorld(name: string, seed = 42): Promise<{
    worldId: string;
    seasonId: string;
    l1LeagueId: string;
    l2LeagueId: string;
    teamCount: number;
  }> {
    // 1. 获取或创建赛季
    const season = await this.seasonService.getCurrentSeason();

    // 2. 创建 World
    const world = await this.prisma.world.create({
      data: { name, seasonId: season.id },
    });

    // 3. 创建 L1 / L2 联赛
    const l1League = await this.prisma.league.create({
      data: {
        name: `${name} - L1`,
        level: 1,
        worldId: world.id,
        seasonId: season.id,
      },
    });

    const l2League = await this.prisma.league.create({
      data: {
        name: `${name} - L2`,
        level: 2,
        worldId: world.id,
        seasonId: season.id,
      },
    });

    // 4. 生成 16 支球队并持久化
    const teams = generateAllTeams(seed);
    if (teams.length !== WORLD_TEAM_COUNT) {
      throw new Error(`Expected ${WORLD_TEAM_COUNT} teams, got ${teams.length}`);
    }

    // 按球队 OVR 排序，前 8 入 L1，后 8 入 L2
    const sortedTeams = [...teams].sort((a, b) => {
      const ovrA = this.teamOverall(a);
      const ovrB = this.teamOverall(b);
      return ovrB - ovrA;
    });

    for (let i = 0; i < sortedTeams.length; i++) {
      const team = sortedTeams[i]!;
      const leagueId = i < L1_TEAM_COUNT ? l1League.id : l2League.id;
      // 世界内球队 ID 加前缀，避免与其他世界/M1 球队冲突
      const teamId = `${world.id}_${team.id}`;

      await this.prisma.team.create({
        data: {
          id: teamId,
          name: team.name,
          chemistry: team.chemistry,
          worldId: world.id,
          leagueId,
          players: {
            create: team.players.map((p) => ({
              id: `${world.id}_${p.id}`,
              name: p.name,
              position: p.position,
              abilities: p.abilities as unknown as object,
              traits: p.traits as unknown as object,
              age: 25,
              salary: this.calculateSalary(p.abilities),
            })),
          },
          lineup: {
            create: {
              starters: team.lineup.starters.map((s) => `${world.id}_${s}`),
              minutes: Object.fromEntries(
                Object.entries(team.lineup.minutes).map(([k, v]) => [
                  `${world.id}_${k}`,
                  v,
                ]),
              ),
            },
          },
          tactic: {
            create: {
              presetId: "pace_space",
              modSet: tacticFromPreset(teamId, "pace_space") as unknown as object,
            },
          },
        },
      });

      // 5. 创建 Standing 记录
      await this.prisma.standing.create({
        data: {
          leagueId,
          teamId,
          seasonId: season.id,
        },
      });
    }

    // 6. 为两个联赛生成赛程
    await this.scheduleService.generateSchedule(season.id, l1League.id);
    await this.scheduleService.generateSchedule(season.id, l2League.id);

    this.logger.log(
      `世界 "${name}" 创建完成：${WORLD_TEAM_COUNT} 队 (L1=${L1_TEAM_COUNT}, L2=${L2_TEAM_COUNT})`,
    );

    return {
      worldId: world.id,
      seasonId: season.id,
      l1LeagueId: l1League.id,
      l2LeagueId: l2League.id,
      teamCount: WORLD_TEAM_COUNT,
    };
  }

  /** 列出所有世界（简要信息） */
  async listWorlds() {
    const worlds = await this.prisma.world.findMany({
      include: {
        season: { select: { id: true, name: true, status: true } },
        teams: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        leagues: { select: { id: true, name: true, level: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return worlds.map((w) => ({
      id: w.id,
      name: w.name,
      seasonId: w.seasonId,
      seasonName: w.season.name,
      seasonStatus: w.season.status,
      teamCount: w.teams.length,
      leagues: w.leagues.map((l) => ({ id: l.id, name: l.name, level: l.level })),
      teams: w.teams,
      createdAt: w.createdAt,
    }));
  }

  /** 查询世界详情（含球队、联赛、积分榜） */
  async getWorld(worldId: string) {
    const world = await this.prisma.world.findUnique({
      where: { id: worldId },
      include: {
        season: true,
        leagues: {
          include: {
            teams: { select: { id: true, name: true } },
            standings: {
              include: { team: { select: { id: true, name: true } } },
              orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
            },
          },
        },
        teams: {
          select: {
            id: true,
            name: true,
            userId: true,
            leagueId: true,
            _count: { select: { players: true } },
          },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!world) {
      throw new NotFoundException(`World ${worldId} not found`);
    }

    return {
      id: world.id,
      name: world.name,
      season: world.season,
      leagues: world.leagues.map((l) => ({
        id: l.id,
        name: l.name,
        level: l.level,
        teams: l.teams,
        standings: l.standings.map((s) => ({
          teamId: s.teamId,
          teamName: s.team.name,
          wins: s.wins,
          losses: s.losses,
          pointsFor: s.pointsFor,
          pointsAgainst: s.pointsAgainst,
          streak: s.streak,
        })),
      })),
      teams: world.teams,
    };
  }

  /**
   * 玩家加入世界：认领一支未被认领的 AI 球队
   */
  async joinWorld(worldId: string, userId: string, teamId: string): Promise<{ teamId: string }> {
    const world = await this.prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new NotFoundException(`World ${worldId} not found`);
    }

    const team = await this.prisma.team.findFirst({
      where: { id: teamId, worldId, userId: null },
    });
    if (!team) {
      throw new NotFoundException(`Team ${teamId} not available in world ${worldId}`);
    }

    await this.prisma.team.update({
      where: { id: teamId },
      data: { userId },
    });

    this.logger.log(`用户 ${userId} 认领球队 ${team.name} (${teamId})`);
    return { teamId };
  }

  // ── 工具方法 ──

  /** 计算球队平均 OVR（用于 L1/L2 分级） */
  private teamOverall(team: Team): number {
    if (team.players.length === 0) return 0;
    const sum = team.players.reduce((acc, p) => acc + this.playerOverall(p.abilities), 0);
    return Math.round(sum / team.players.length);
  }

  /** 球员综合评分（与 shared 的 overallRating 保持一致） */
  private playerOverall(a: {
    three: number; midrange: number; inside: number; drive: number; postup: number;
    passing: number; ballHandle: number; perimeterD: number; interiorD: number;
    steal: number; block: number; speed: number; strength: number; jumping: number;
    stamina: number; iq: number; clutch: number;
  }): number {
    const offense = (a.three + a.midrange + a.inside + a.drive + a.postup + a.ballHandle + a.passing) / 7;
    const defense = (a.perimeterD + a.interiorD + a.steal + a.block) / 4;
    const body = (a.speed + a.strength + a.jumping + a.stamina) / 4;
    const mental = (a.iq + a.clutch) / 2;
    return Math.round(offense * 0.4 + defense * 0.25 + body * 0.2 + mental * 0.15);
  }

  /** 简易薪资计算：基于 OVR 的年薪（单位：万元） */
  private calculateSalary(abilities: {
    three: number; midrange: number; inside: number; drive: number; postup: number;
    passing: number; ballHandle: number; perimeterD: number; interiorD: number;
    steal: number; block: number; speed: number; strength: number; jumping: number;
    stamina: number; iq: number; clutch: number;
  }): number {
    const ovr = this.playerOverall(abilities);
    // OVR 60 → 200万, OVR 75 → 800万, OVR 90 → 2000万
    return Math.round(200 + (ovr - 60) * 120);
  }
}
