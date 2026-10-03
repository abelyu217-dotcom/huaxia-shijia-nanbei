/**
 * ScoutController——球探/迷雾系统端点
 *
 * - GET  /api/scout/reports              获取本队所有球探报告
 * - GET  /api/scout/reports/:playerId    获取对某球员的球探报告
 * - GET  /api/scout/budget               获取球探预算状态
 * - POST /api/scout/players/:playerId           球员探查（收窄能力 fog）
 * - POST /api/scout/players/:playerId/potential 潜力探查（收窄 Peak fog）
 *
 * v0.6 §批次6 ScoutMission（派向各类职员）：
 * - GET  /api/scout/missions             列出本队 ScoutMission（可选 status）
 * - POST /api/scout/missions             创建 ScoutMission（派球探）
 * - POST /api/scout/missions/:id/complete 手动完成任务
 * - POST /api/scout/missions/:id/cancel   撤回任务
 *
 * 所有写操作需 JWT，且只能操作本队的球探资源。
 */

import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
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

  // ── ScoutMission ──

  @UseGuards(JwtAuthGuard)
  @Get("missions")
  async listMissions(
    @Request() req: { user: { teamId: string | null } },
    @Query("status") status?: string,
  ) {
    if (!req.user.teamId) return [];
    return this.scoutService.listMissions(req.user.teamId, {
      status: (status as "pending" | "completed" | "expired" | undefined) ?? undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("missions")
  async createMission(
    @Body() body: { scoutId: string; targetType: string; targetRef?: string | null; region?: string | null },
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (!req.user.teamId) return { error: "no team" };
    return this.scoutService.createMission({
      teamId: req.user.teamId,
      scoutId: body.scoutId,
      targetType: body.targetType,
      targetRef: body.targetRef ?? null,
      region: body.region ?? null,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("missions/:id/complete")
  async completeMission(@Param("id") id: string) {
    return this.scoutService.completeMission(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("missions/:id/cancel")
  async cancelMission(
    @Param("id") id: string,
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (!req.user.teamId) return { error: "no team" };
    await this.scoutService.cancelMission(id, req.user.teamId);
    return { ok: true };
  }
}
