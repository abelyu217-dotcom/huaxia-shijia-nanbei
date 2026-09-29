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
}
