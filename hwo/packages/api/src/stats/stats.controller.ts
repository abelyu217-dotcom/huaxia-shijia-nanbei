/**
 * StatsController——球员赛季累计统计端点
 *
 * - GET /api/stats/team/:teamId   球队所有球员本赛季累计技术统计
 *   （聚合已结算比赛的 MatchResult.boxScore）
 *
 * 参见：basketpulse.com/hk/Players/skills 数据统计风格
 */

import { Controller, Get, Param } from "@nestjs/common";
import { StatsService } from "./stats.service.js";

@Controller("api/stats")
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /** 球队球员赛季累计统计 */
  @Get("team/:teamId")
  async getTeamPlayerStats(@Param("teamId") teamId: string) {
    return this.statsService.getTeamPlayerSeasonStats(teamId);
  }
}
