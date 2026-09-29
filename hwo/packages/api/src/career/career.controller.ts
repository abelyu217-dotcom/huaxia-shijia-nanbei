/**
 * CareerController——球员生涯弧线端点
 *
 * - GET  /api/career/player/:playerId   获取球员生涯信息
 * - GET  /api/career/team/:teamId       获取球队全部球员生涯信息
 * - POST /api/career/train/:playerId    手动训练球员
 * - POST /api/career/advance            管理员：推进赛季成长（赛季结束时自动调用）
 */

import { Controller, Get, Param, Post } from "@nestjs/common";
import { CareerService } from "./career.service.js";

@Controller("api/career")
export class CareerController {
  constructor(private readonly careerService: CareerService) {}

  @Get("player/:playerId")
  async getPlayerCareer(@Param("playerId") playerId: string) {
    return this.careerService.getPlayerCareer(playerId);
  }

  @Get("team/:teamId")
  async getTeamCareers(@Param("teamId") teamId: string) {
    return this.careerService.getTeamPlayerCareers(teamId);
  }

  @Post("train/:playerId")
  async trainPlayer(@Param("playerId") playerId: string) {
    return this.careerService.trainPlayer(playerId);
  }

  @Post("advance")
  async advanceSeason() {
    const year = new Date().getFullYear();
    return this.careerService.advanceAllPlayers(year);
  }
}
