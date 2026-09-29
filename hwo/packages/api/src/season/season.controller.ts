/**
 * SeasonController——赛季与积分榜端点
 *
 * - GET /api/season              当前赛季信息
 * - GET /api/season/standings    积分榜
 */

import { Controller, Get } from "@nestjs/common";
import { SeasonService } from "./season.service.js";

@Controller("api/season")
export class SeasonController {
  constructor(private readonly seasonService: SeasonService) {}

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
}
