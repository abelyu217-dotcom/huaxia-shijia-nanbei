/**
 * SeasonController——赛季、积分榜、赛程、推进端点
 *
 * - GET  /api/season              当前赛季信息
 * - GET  /api/season/standings    积分榜
 * - GET  /api/season/schedule     赛程（按日分组）
 * - POST /api/season/advance      推进一日（结算当日所有比赛）
 * - POST /api/season/generate     生成赛程
 */

import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { SeasonService } from "./season.service.js";
import { ScheduleService } from "./schedule.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("api/season")
export class SeasonController {
  constructor(
    private readonly seasonService: SeasonService,
    private readonly scheduleService: ScheduleService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async current() {
    const season = await this.seasonService.getCurrentSeason();
    return {
      id: season.id,
      name: season.name,
      year: season.year,
      status: season.status,
      currentDay: season.currentDay,
    };
  }

  @Get("standings")
  async standings(@Query("leagueId") leagueId?: string) {
    const season = await this.seasonService.getCurrentSeason();
    return this.seasonService.getStandings(season.id, leagueId || undefined);
  }

  /** 当前赛季的所有联赛列表（国内 L1/L2 + 国际联赛） */
  @Get("leagues")
  async leagues() {
    const season = await this.seasonService.getCurrentSeason();
    return this.prisma.league.findMany({
      where: { seasonId: season.id },
      select: { id: true, name: true, level: true, type: true, worldId: true },
      orderBy: [{ type: "asc" }, { level: "asc" }],
    });
  }

  @Get("schedule")
  async schedule() {
    const season = await this.seasonService.getCurrentSeason();
    return this.seasonService.getSchedule(season.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("advance")
  async advance() {
    const season = await this.seasonService.getCurrentSeason();
    return this.scheduleService.advanceDay(season.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("generate")
  async generate() {
    const season = await this.seasonService.getCurrentSeason();

    // 获取当前赛季所有联赛
    let leagues = await this.prisma.league.findMany({
      where: { seasonId: season.id },
    });

    // 若没有联赛，创建默认 L1 联赛
    if (leagues.length === 0) {
      const league = await this.prisma.league.create({
        data: { seasonId: season.id, name: "HWO Premier", level: 1 },
      });
      leagues = [league];
    }

    // 始终把未关联联赛的球队归入第一个联赛（处理历史数据）
    const orphanTeams = await this.prisma.team.count({
      where: { leagueId: null },
    });
    if (orphanTeams > 0) {
      await this.prisma.team.updateMany({
        where: { leagueId: null },
        data: { leagueId: leagues[0]!.id },
      });
    }

    // 为每个联赛生成赛程
    let total = 0;
    for (const league of leagues) {
      total += await this.scheduleService.generateSchedule(season.id, league.id);
    }
    return { generated: total, leagues: leagues.length };
  }
}
