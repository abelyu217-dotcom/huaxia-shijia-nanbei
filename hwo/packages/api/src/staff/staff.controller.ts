/**
 * StaffController——职员雇佣与管理端点
 *
 * - GET  /api/staff/team/:teamId          列出本队雇佣职员
 * - GET  /api/staff/pool                   可雇佣 NPC 池（可选 job 过滤）
 * - POST /api/staff/hire                   雇佣职员（需 JWT，扣签约费）
 * - POST /api/staff/:id/fire               解雇职员（需 JWT）
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { StaffService, type StaffJob } from "./staff.service.js";

@Controller("api/staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get("team/:teamId")
  async listByTeam(@Param("teamId") teamId: string) {
    return this.staff.listByTeam(teamId);
  }

  @Get("pool")
  async listPool(
    @Query("job") job?: string,
    @Query("limit") limit?: string,
  ) {
    return this.staff.listHiringPool({
      job: (job as StaffJob | undefined) ?? undefined,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Post("hire")
  @UseGuards(JwtAuthGuard)
  async hire(@Body() body: { professionalId: string; teamId: string }) {
    return this.staff.hire(body.professionalId, body.teamId);
  }

  @Post(":id/fire")
  @UseGuards(JwtAuthGuard)
  async fire(
    @Param("id") professionalId: string,
    @Body() body: { teamId: string },
  ) {
    return this.staff.fire(professionalId, body.teamId);
  }
}
