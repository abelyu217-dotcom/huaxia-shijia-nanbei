/**
 * OperationsController——运营中心 REST 接口
 *
 * - GET  /api/operations/:teamId/overview?seasonId=xxx  运营中心总览
 * - GET  /api/operations/:teamId/fan-center              球迷中心
 * - GET  /api/operations/:teamId/events?seasonId=xxx    球迷事件流
 */

import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { OperationsService } from "./operations.service.js";

@Controller("api/operations")
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(
    private readonly ops: OperationsService,
    private readonly prisma: PrismaService,
  ) {}

  /** 运营中心总览 */
  @Get(":teamId/overview")
  async overview(
    @Param("teamId") teamId: string,
    @Query("seasonId") seasonId?: string,
  ) {
    const sid = seasonId ?? (await this.getCurrentSeasonId());
    return this.ops.getOverview(teamId, sid);
  }

  /** 球迷中心 */
  @Get(":teamId/fan-center")
  async fanCenter(@Param("teamId") teamId: string) {
    return this.ops.getFanCenter(teamId);
  }

  /** 球迷事件流 */
  @Get(":teamId/events")
  async events(
    @Param("teamId") teamId: string,
    @Query("seasonId") seasonId?: string,
    @Query("limit") limit?: string,
  ) {
    const sid = seasonId ?? (await this.getCurrentSeasonId());
    return this.ops.listFanEvents(teamId, sid, limit ? parseInt(limit, 10) : 30);
  }

  private async getCurrentSeasonId(): Promise<string> {
    const season = await this.prisma.season.findFirst({
      where: { status: { in: ["regular", "playoff"] } },
      orderBy: { year: "desc" },
    });
    if (!season) throw new Error("当前无进行中的赛季");
    return season.id;
  }
}
