/**
 * SeasonController——赛季、积分榜、赛程、推进端点
 *
 * - GET  /api/season              当前赛季信息
 * - GET  /api/season/standings    积分榜
 * - GET  /api/season/schedule     赛程（按日分组）
 * - POST /api/season/advance      推进一日（结算当日所有比赛）
 * - POST /api/season/generate     生成赛程
 */

import { Controller, Get, Post, UseGuards } from "@nestjs/common";
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
  async standings() {
    const season = await this.seasonService.getCurrentSeason();
    return this.seasonService.getStandings(season.id);
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
    let league = await this.prisma.league.findFirst({
      where: { seasonId: season.id },
    });
    if (!league) {
      league = await this.prisma.league.create({
        data: { seasonId: season.id, name: "HWO Premier", level: 1 },
      });
      await this.prisma.team.updateMany({
        where: { leagueId: null },
        data: { leagueId: league.id },
      });
    }
    const count = await this.scheduleService.generateSchedule(season.id, league.id);
    return { generated: count };
  }
}
