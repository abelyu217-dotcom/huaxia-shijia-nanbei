/**
 * SeasonService——赛季与积分榜管理
 *
 * 职责：
 * 1. 获取当前激活赛季
 * 2. 查询/更新积分榜（Standing）
 * 3. 根据比赛结果更新积分榜（胜场、负场、得失分、连胜）
 */

import { Injectable, Logger, forwardRef, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { CareerService } from "../career/career.service.js";
import { AcademyService } from "../academy/academy.service.js";
import { ContractService } from "../contract/contract.service.js";
import { DraftService } from "../draft/draft.service.js";
import { BoardService } from "../board/board.service.js";
import { MarketService } from "../market/market.service.js";

@Injectable()
export class SeasonService {
  private readonly logger = new Logger(SeasonService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CareerService))
    private readonly careerService: CareerService,
    @Inject(forwardRef(() => AcademyService))
    private readonly academyService: AcademyService,
    @Inject(forwardRef(() => ContractService))
    private readonly contractService: ContractService,
    private readonly draftService: DraftService,
    @Inject(forwardRef(() => BoardService))
    private readonly boardService: BoardService,
    @Inject(forwardRef(() => MarketService))
    private readonly marketService: MarketService,
  ) {}

  /** 获取当前激活的赛季（常规赛或季后赛阶段），不存在则创建 */
  async getCurrentSeason() {
    let season = await this.prisma.season.findFirst({
      where: { status: { in: ["regular", "playoff"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!season) {
      season = await this.prisma.season.create({
        data: {
          year: new Date().getFullYear(),
          name: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
          status: "regular",
          currentDay: 1,
        },
      });
    }
    return season;
  }

  /** 查询某赛季的积分榜（按胜率排序） */
  async getStandings(seasonId: string, leagueId?: string) {
    const where: { seasonId: string; leagueId?: string } = { seasonId };
    if (leagueId) where.leagueId = leagueId;
    const standings = await this.prisma.standing.findMany({
      where,
      include: { team: { select: { id: true, name: true } } },
      orderBy: [
        { wins: "desc" },
        { pointsFor: "desc" },
      ],
    });
    return standings.map((s) => ({
      teamId: s.teamId,
      teamName: s.team.name,
      wins: s.wins,
      losses: s.losses,
      pointsFor: s.pointsFor,
      pointsAgainst: s.pointsAgainst,
      streak: s.streak,
      winRate: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0,
    }));
  }

  /**
   * 根据一场比赛结果更新双方积分榜
   * 使用 upsert 保证球队首次出现时自动建档
   */
  async applyMatchResult(
    seasonId: string,
    leagueId: string,
    result: {
      homeTeamId: string;
      awayTeamId: string;
      homeScore: number;
      awayScore: number;
      winnerId: string;
    },
  ): Promise<void> {
    const { homeTeamId, awayTeamId, homeScore, awayScore, winnerId } = result;
    const homeWin = winnerId === homeTeamId;

    await Promise.all([
      this.upsertStanding(seasonId, leagueId, homeTeamId, {
        win: homeWin,
        pointsFor: homeScore,
        pointsAgainst: awayScore,
      }),
      this.upsertStanding(seasonId, leagueId, awayTeamId, {
        win: !homeWin,
        pointsFor: awayScore,
        pointsAgainst: homeScore,
      }),
    ]);

    this.logger.log(
      `Standings updated: ${homeTeamId} ${homeScore}-${awayScore} ${awayTeamId}`,
    );
  }

  private async upsertStanding(
    seasonId: string,
    leagueId: string,
    teamId: string,
    delta: { win: boolean; pointsFor: number; pointsAgainst: number },
  ) {
    const existing = await this.prisma.standing.findUnique({
      where: { leagueId_teamId: { leagueId, teamId } },
    });

    if (!existing) {
      return this.prisma.standing.create({
        data: {
          seasonId,
          leagueId,
          teamId,
          wins: delta.win ? 1 : 0,
          losses: delta.win ? 0 : 1,
          pointsFor: delta.pointsFor,
          pointsAgainst: delta.pointsAgainst,
          streak: delta.win ? "W1" : "L1",
        },
      });
    }

    const newWins = existing.wins + (delta.win ? 1 : 0);
    const newLosses = existing.losses + (delta.win ? 0 : 1);
    const newStreak = this.updateStreak(existing.streak, delta.win);

    return this.prisma.standing.update({
      where: { leagueId_teamId: { leagueId, teamId } },
      data: {
        wins: newWins,
        losses: newLosses,
        pointsFor: existing.pointsFor + delta.pointsFor,
        pointsAgainst: existing.pointsAgainst + delta.pointsAgainst,
        streak: newStreak,
      },
    });
  }

  /** 连胜/连败串计算：W3 + win → W4, W3 + loss → L1 */
  private updateStreak(current: string | null, win: boolean): string {
    if (!current) return win ? "W1" : "L1";
    const prefix = current[0];
    const count = parseInt(current.slice(1), 10) || 0;
    if ((win && prefix === "W") || (!win && prefix === "L")) {
      return `${prefix}${count + 1}`;
    }
    return win ? "W1" : "L1";
  }

  /** 推进赛季日程到下一日 */
  async advanceDay(seasonId: string): Promise<number> {
    const season = await this.prisma.season.update({
      where: { id: seasonId },
      data: { currentDay: { increment: 1 } },
      select: { currentDay: true },
    });
    return season.currentDay;
  }

  /**
   * 赛季结束处理：
   * 1. 标记当前赛季为 offseason
   * 2. 创建新赛季
   * 3. 升降级：L1 末尾 2 队降入 L2，L2 前 2 队升入 L1
   * 4. 为联赛在新赛季创建对应记录，球队按升降级结果重新分配
   * 5. 清空积分榜（新赛季重新建档）
   * 返回 true 表示赛季已交接
   */
  async handleSeasonEnd(seasonId: string): Promise<boolean> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return false;

    // 标记当前赛季结束
    await this.prisma.season.update({
      where: { id: seasonId },
      data: { status: "offseason" },
    });

    // 创建新赛季
    const newYear = season.year + 1;
    const newSeason = await this.prisma.season.create({
      data: {
        year: newYear,
        name: `${newYear}-${newYear + 1}`,
        status: "regular",
        currentDay: 1,
      },
    });

    // 获取当前赛季所有联赛（按 world 分组）
    const leagues = await this.prisma.league.findMany({
      where: { seasonId },
      include: { world: true },
    });

    // 按 world 分组处理升降级
    const worlds = new Map<string, typeof leagues>();
    for (const league of leagues) {
      const key = league.worldId ?? "default";
      if (!worlds.has(key)) worlds.set(key, []);
      worlds.get(key)!.push(league);
    }

    for (const [, worldLeagues] of worlds) {
      const l1 = worldLeagues.find((l) => l.level === 1);
      const l2 = worldLeagues.find((l) => l.level === 2);

      // 计算升降级球队
      let relegatedTeamIds: string[] = [];
      let promotedTeamIds: string[] = [];

      if (l1 && l2) {
        const { relegated, promoted } = await this.calculateRelegation(l1.id, l2.id);
        relegatedTeamIds = relegated;
        promotedTeamIds = promoted;
        this.logger.log(
          `升降级：L1 降级 [${relegated.join(", ")}] → L2；L2 升级 [${promoted.join(", ")}] → L1`,
        );
      }

      // 为每个联赛在新赛季创建对应记录，并重新分配球队
      for (const league of worldLeagues) {
        const newLeague = await this.prisma.league.create({
          data: {
            seasonId: newSeason.id,
            name: league.name,
            level: league.level,
            worldId: league.worldId,
          },
        });

        // 获取该联赛下的所有球队
        const teams = await this.prisma.team.findMany({
          where: { leagueId: league.id },
          select: { id: true },
        });

        // 按升降级结果调整球队归属
        let teamIds = teams.map((t) => t.id);

        if (league.level === 1 && l1 && l2) {
          // L1：移除降级球队，加入升级球队
          teamIds = teamIds.filter((id) => !relegatedTeamIds.includes(id));
          teamIds.push(...promotedTeamIds);
        } else if (league.level === 2 && l1 && l2) {
          // L2：移除升级球队，加入降级球队
          teamIds = teamIds.filter((id) => !promotedTeamIds.includes(id));
          teamIds.push(...relegatedTeamIds);
        }

        // 将球队关联到新联赛
        if (teamIds.length > 0) {
          await this.prisma.team.updateMany({
            where: { id: { in: teamIds } },
            data: { leagueId: newLeague.id },
          });

          // 为新联赛创建初始积分榜
          await this.prisma.standing.createMany({
            data: teamIds.map((teamId) => ({
              leagueId: newLeague.id,
              teamId,
              seasonId: newSeason.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // M3: 推进球员生涯成长 + 退役
    try {
      const { grown, retired } = await this.careerService.advanceAllPlayers(season.year);
      this.logger.log(`生涯成长：${grown} 人成长，${retired} 人退役`);
    } catch (e) {
      this.logger.warn(
        `生涯推进失败（不影响赛季交接）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // M3: 合同推进（剩余年数 -1，到期球员成为自由球员）
    try {
      const { decremented: contractsRenewed, expired: contractsExpired } =
        await this.contractService.advanceAllContracts();
      this.logger.log(
        `合同推进：${contractsRenewed} 份续期，${contractsExpired} 份到期`,
      );
    } catch (e) {
      this.logger.warn(
        `合同推进失败（不影响赛季交接）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // M3: 青训学院产出新秀
    try {
      const { teamsProcessed, totalRookies } = await this.academyService.produceAllRookies(
        newSeason.year,
      );
      this.logger.log(
        `青训产出：${teamsProcessed} 支球队，共 ${totalRookies} 名新秀加入各队`,
      );
    } catch (e) {
      this.logger.warn(
        `青训产出失败（不影响赛季交接）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // M3: 为每个有球队的世界初始化新赛季选秀大会（乐透抽签 + 生成选秀池）
    // 注意：不能仅依赖 worlds（来自联赛），否则无联赛的世界会漏掉选秀
    const worldTeams = await this.prisma.team.findMany({
      where: { id: { not: { startsWith: "DRAFT_POOL_" } } },
      select: { worldId: true },
      distinct: ["worldId"],
    });
    const worldIds = worldTeams.map((t) => t.worldId ?? "default");
    let totalDraftPicks = 0;
    let totalProspects = 0;
    for (const worldId of worldIds) {
      try {
        const result = await this.draftService.initDraft(newSeason.id, worldId);
        totalDraftPicks += result.picksCreated;
        totalProspects += result.prospectsCreated;
      } catch (e) {
        this.logger.warn(
          `世界 ${worldId} 选秀初始化失败（不影响赛季交接）：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    this.logger.log(
      `选秀初始化：${worldIds.length} 个世界，共 ${totalDraftPicks} 个顺位，${totalProspects} 名选秀球员`,
    );

    // 两级联赛：创建新赛季的国际冠军杯
    try {
      await this.createInternationalLeague(newSeason.id);
    } catch (e) {
      this.logger.warn(
        `国际联赛创建失败（不影响赛季交接）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // v0.6 §批次4 董事会：新赛季初始化 SeasonGoal + BoardDirector
    try {
      const r = await this.boardService.initForNewSeason(newSeason.id, newSeason.year);
      this.logger.log(
        `董事会初始化：${r.goals} 个赛季目标，${r.directors} 名新董事`,
      );
    } catch (e) {
      this.logger.warn(
        `董事会初始化失败（不影响赛季交接）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // v0.6 §批次6 人才市场：新赛季初始化阶段（free_agency）
    try {
      await this.marketService.initForNewSeason(newSeason.id);
    } catch (e) {
      this.logger.warn(
        `市场阶段初始化失败（不影响赛季交接）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    this.logger.log(`赛季交接：${season.name} → ${newSeason.name}`);
    return true;
  }

  /**
   * 为指定赛季创建国际冠军杯联赛：
   * 从所有 world 的 L1 国内联赛取前 2 名组成国际联赛
   */
  private async createInternationalLeague(seasonId: string): Promise<void> {
    const l1Leagues = await this.prisma.league.findMany({
      where: { seasonId, type: "domestic", level: 1 },
      select: { id: true },
    });
    if (l1Leagues.length === 0) return;

    const qualifiedTeamIds: string[] = [];
    for (const l1 of l1Leagues) {
      const topStandings = await this.prisma.standing.findMany({
        where: { leagueId: l1.id },
        orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
        take: 2,
        select: { teamId: true },
      });
      qualifiedTeamIds.push(...topStandings.map((s) => s.teamId));
    }
    if (qualifiedTeamIds.length < 2) return;

    const intlLeague = await this.prisma.league.create({
      data: {
        name: "国际冠军杯",
        level: 1,
        type: "international",
        worldId: null,
        seasonId,
      },
    });

    await this.prisma.leagueTeam.createMany({
      data: qualifiedTeamIds.map((teamId) => ({
        leagueId: intlLeague.id,
        teamId,
      })),
      skipDuplicates: true,
    });

    await this.prisma.standing.createMany({
      data: qualifiedTeamIds.map((teamId) => ({
        leagueId: intlLeague.id,
        teamId,
        seasonId,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`国际冠军杯已创建：${qualifiedTeamIds.length} 支球队入围`);
  }

  /**
   * 计算升降级球队：
   * - L1 积分榜最后 2 名降级
   * - L2 积分榜前 2 名升级
   */
  private async calculateRelegation(l1LeagueId: string, l2LeagueId: string): Promise<{
    relegated: string[];
    promoted: string[];
  }> {
    const [l1Standings, l2Standings] = await Promise.all([
      this.prisma.standing.findMany({
        where: { leagueId: l1LeagueId },
        orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
      }),
      this.prisma.standing.findMany({
        where: { leagueId: l2LeagueId },
        orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
      }),
    ]);

    // L1 最后 2 名降级
    const relegated = l1Standings.slice(-2).map((s) => s.teamId);
    // L2 前 2 名升级
    const promoted = l2Standings.slice(0, 2).map((s) => s.teamId);

    return { relegated, promoted };
  }

  /** 获取赛季赛程（按日分组） */
  async getSchedule(seasonId: string) {
    const matches = await this.prisma.match.findMany({
      where: { seasonId },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        result: { select: { homeScore: true, awayScore: true, winnerId: true } },
      },
      orderBy: [{ day: "asc" }, { id: "asc" }],
    });

    // 按日分组
    const byDay: Record<number, typeof matches> = {};
    for (const m of matches) {
      if (!byDay[m.day]) byDay[m.day] = [];
      byDay[m.day].push(m);
    }

    return Object.entries(byDay).map(([day, dayMatches]) => ({
      day: parseInt(day, 10),
      matches: dayMatches.map((m) => ({
        id: m.id,
        homeTeamId: m.homeTeamId,
        homeTeamName: m.homeTeam.name,
        awayTeamId: m.awayTeamId,
        awayTeamName: m.awayTeam.name,
        status: m.status,
        homeScore: m.result?.homeScore ?? null,
        awayScore: m.result?.awayScore ?? null,
        winnerId: m.result?.winnerId ?? null,
      })),
    }));
  }
}
