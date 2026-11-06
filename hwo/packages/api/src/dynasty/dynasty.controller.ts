/**
 * DynastyController——王朝与传承系统端点（P3-3）
 *
 * - GET  /api/dynasty/team/:teamId       球队王朝记录
 * - GET  /api/dynasty/hall-of-fame       名人堂名单
 * - GET  /api/dynasty/player/:playerId   球员时代标签 + 传承遗产
 * - GET  /api/dynasty/team/:teamId/tags  球队时代标签
 */

import { Controller, Get, Param } from "@nestjs/common";
import { DynastyService } from "./dynasty.service.js";

@Controller("api/dynasty")
export class DynastyController {
  constructor(private readonly dynastyService: DynastyService) {}

  @Get("team/:teamId")
  async getTeamDynasty(@Param("teamId") teamId: string) {
    return this.dynastyService.getTeamDynasty(teamId);
  }

  @Get("hall-of-fame")
  async getHallOfFame() {
    return this.dynastyService.getHallOfFame();
  }

  @Get("player/:playerId")
  async getPlayerLegacy(@Param("playerId") playerId: string) {
    return this.dynastyService.getPlayerLegacy(playerId);
  }

  @Get("team/:teamId/tags")
  async getTeamTags(@Param("teamId") teamId: string) {
    return this.dynastyService.getTeamEraTags(teamId);
  }
}
