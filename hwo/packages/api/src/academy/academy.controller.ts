/**
 * AcademyController——青训学院端点
 *
 * - GET  /api/academy/:teamId          获取球队青训学院
 * - POST /api/academy/:teamId/upgrade  升级学院
 * - POST /api/academy/:teamId/invest   投入资金
 * - POST /api/academy/:teamId/produce  手动产出新秀（测试用）
 */

import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { AcademyService } from "./academy.service.js";

@Controller("api/academy")
export class AcademyController {
  constructor(private readonly academyService: AcademyService) {}

  @Get(":teamId")
  async getAcademy(@Param("teamId") teamId: string) {
    const academy = await this.academyService.getAcademy(teamId);
    return {
      ...academy,
      level: academy.level,
      investment: academy.investment,
      lastProdYear: academy.lastProdYear,
    };
  }

  @Post(":teamId/upgrade")
  async upgrade(@Param("teamId") teamId: string) {
    return this.academyService.upgradeAcademy(teamId);
  }

  @Post(":teamId/invest")
  async invest(
    @Param("teamId") teamId: string,
    @Body() body: { amount: number },
  ) {
    return this.academyService.investAcademy(teamId, body.amount);
  }

  @Post(":teamId/produce")
  async produce(@Param("teamId") teamId: string) {
    const year = new Date().getFullYear();
    return this.academyService.produceRookies(teamId, year);
  }
}
