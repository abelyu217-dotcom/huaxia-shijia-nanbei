/**
 * SeasonService——赛季与积分榜管理
 *
 * 职责：
 * 1. 获取当前激活赛季
 * 2. 查询/更新积分榜（Standing）
 * 3. 根据比赛结果更新积分榜（胜场、负场、得失分、连胜）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class SeasonService {
  private readonly logger = new Logger(SeasonService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 获取当前激活的常规赛赛季，不存在则创建 */
  async getCurrentSeason() {
    let season = await this.prisma.season.findFirst({
      where: { status: "regular" },
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
  async getStandings(seasonId: string) {
    const standings = await this.prisma.standing.findMany({
      where: { seasonId },
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
   * 3. 清空积分榜（新赛季重新建档）
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

    // 获取联赛
    const leagues = await this.prisma.league.findMany({
      where: { seasonId },
    });

    // 为联赛在新赛季创建对应记录
    for (const league of leagues) {
      const newLeague = await this.prisma.league.create({
        data: {
          seasonId: newSeason.id,
          name: league.name,
          level: league.level,
        },
      });

      // 将球队关联到新联赛
      const teams = await this.prisma.team.findMany({
        where: { leagueId: league.id },
        select: { id: true },
      });
      await this.prisma.team.updateMany({
        where: { id: { in: teams.map((t) => t.id) } },
        data: { leagueId: newLeague.id },
      });
    }

    this.logger.log(`赛季交接：${season.name} → ${newSeason.name}`);
    return true;
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
