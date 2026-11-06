/**
 * TrainingController——训练计划与日志端点
 *
 * - GET  /api/training/:teamId/plan          读取训练计划
 * - PUT  /api/training/:teamId/plan          更新训练计划（需 JWT）
 * - GET  /api/training/:teamId/logs         训练日志（按 day / 范围 / 球员过滤）
 * - GET  /api/training/:teamId/today         当日训练汇总
 */

import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { TrainingService } from "./training.service.js";

@Controller("api/training")
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get(":teamId/plan")
  async getPlan(@Param("teamId") teamId: string) {
    return this.training.getPlan(teamId);
  }

  @Put(":teamId/plan")
  @UseGuards(JwtAuthGuard)
  async updatePlan(
    @Param("teamId") teamId: string,
    @Body() body: { focusByPosition?: Record<string, string>; teamFocus?: Record<string, number> },
  ) {
    return this.training.updatePlan(teamId, body.focusByPosition, body.teamFocus);
  }

  @Get(":teamId/logs")
  async getLogs(
    @Param("teamId") teamId: string,
    @Query("day") day?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("playerId") playerId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.training.getLogs(teamId, {
      day: day ? Number(day) : undefined,
      dayGte: from ? Number(from) : undefined,
      dayLte: to ? Number(to) : undefined,
      playerId: playerId || undefined,
      limit: limit ? Number(limit) : 200,
    });
  }

  @Get(":teamId/today")
  async getTodaySummary(
    @Param("teamId") teamId: string,
    @Query("seasonId") seasonId?: string,
    @Query("day") day?: string,
  ) {
    // 默认查询当前赛季当天；可由查询参数覆盖
    const sid = seasonId;
    const d = day ? Number(day) : undefined;
    if (sid && d) {
      return this.training.getDailySummary(teamId, sid, d);
    }
    // 兜底：返回最近一天的训练汇总
    return this.training.getDailySummary(teamId, sid ?? "", d ?? 0);
  }
}
