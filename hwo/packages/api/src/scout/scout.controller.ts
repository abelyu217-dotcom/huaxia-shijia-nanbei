/**
 * ScoutController——球探/迷雾系统端点
 *
 * - GET  /api/scout/reports              获取本队所有球探报告
 * - GET  /api/scout/reports/:playerId    获取对某球员的球探报告
 * - GET  /api/scout/budget               获取球探预算状态
 * - POST /api/scout/players/:playerId           球员探查（收窄能力 fog）
 * - POST /api/scout/players/:playerId/potential 潜力探查（收窄 Peak fog）
 *
 * 所有写操作需 JWT，且只能操作本队的球探资源。
 */

import { Controller, Get, Param, Post, Request, UseGuards } from "@nestjs/common";
import { ScoutService } from "./scout.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";

@Controller("api/scout")
export class ScoutController {
  constructor(private readonly scoutService: ScoutService) {}

  @UseGuards(JwtAuthGuard)
  @Get("reports")
  async listReports(@Request() req: { user: { teamId: string | null } }) {
    if (!req.user.teamId) return [];
    return this.scoutService.getTeamReports(req.user.teamId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("reports/:playerId")
  async getReport(
    @Param("playerId") playerId: string,
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (!req.user.teamId) return null;
    return this.scoutService.getReport(req.user.teamId, playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("budget")
  async getBudget(@Request() req: { user: { teamId: string | null } }) {
    if (!req.user.teamId) return { remaining: 0, total: 0, used: 0 };
    return this.scoutService.getBudget(req.user.teamId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("players/:playerId")
  async scoutPlayer(
    @Param("playerId") playerId: string,
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (!req.user.teamId) return { error: "no team" };
    return this.scoutService.scoutPlayer(req.user.teamId, playerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("players/:playerId/potential")
  async scoutPotential(
    @Param("playerId") playerId: string,
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (!req.user.teamId) return { error: "no team" };
    return this.scoutService.scoutPotential(req.user.teamId, playerId);
  }
}
