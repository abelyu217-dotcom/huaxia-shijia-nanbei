/**
 * FacilityController——球馆设施端点（P2-3）
 *
 * - GET  /api/facility/:teamId                 获取球馆设施状态
 * - POST /api/facility/:teamId/upgrade          升级指定设施
 *   body: { type: "trainingHall" | "arena" }
 */

import { Body, Controller, Get, Param, Post, Request, UseGuards } from "@nestjs/common";
import { FacilityService, type FacilityType } from "./facility.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";

@Controller("api/facility")
export class FacilityController {
  constructor(private readonly facilityService: FacilityService) {}

  @Get(":teamId")
  async getFacility(@Param("teamId") teamId: string) {
    return this.facilityService.getFacility(teamId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":teamId/upgrade")
  async upgrade(
    @Param("teamId") teamId: string,
    @Body() body: { type: FacilityType },
    @Request() req: { user: { id: string } },
  ) {
    if (body.type !== "trainingHall" && body.type !== "arena") {
      throw new Error("type 必须为 trainingHall 或 arena");
    }
    return this.facilityService.upgradeFacility(teamId, body.type, req.user.id);
  }
}
