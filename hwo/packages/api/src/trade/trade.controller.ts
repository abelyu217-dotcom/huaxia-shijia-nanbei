/**
 * TradeController——交易系统端点
 *
 * - POST   /api/trades              创建报价
 * - GET    /api/trades/sent/:teamId   我发出的报价
 * - GET    /api/trades/received/:teamId  我收到的报价
 * - POST   /api/trades/:id/accept    接受报价
 * - POST   /api/trades/:id/reject    拒绝报价
 * - POST   /api/trades/:id/counter   还价
 * - POST   /api/trades/:id/ai-decide AI 决策（用于 AI 球队自动处理）
 */

import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { TradeService } from "./trade.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";

@Controller("api/trades")
export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: {
    worldId: string;
    offerorTeamId: string;
    offereeTeamId: string;
    offerorPlayers: string[];
    offereePlayers: string[];
    offerorCash?: number;
    offereeCash?: number;
  }) {
    return this.tradeService.createOffer(body);
  }

  @Get("sent/:teamId")
  async sent(@Param("teamId") teamId: string) {
    return this.tradeService.getSentOffers(teamId);
  }

  @Get("received/:teamId")
  async received(@Param("teamId") teamId: string) {
    return this.tradeService.getReceivedOffers(teamId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/accept")
  async accept(@Param("id") id: string) {
    return this.tradeService.acceptOffer(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/reject")
  async reject(@Param("id") id: string) {
    return this.tradeService.rejectOffer(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/counter")
  async counter(
    @Param("id") id: string,
    @Body() body: {
      offerorPlayers: string[];
      offereePlayers: string[];
      offerorCash?: number;
      offereeCash?: number;
    },
  ) {
    return this.tradeService.counterOffer(id, body);
  }

  @Post(":id/ai-decide")
  async aiDecide(@Param("id") id: string) {
    return this.tradeService.aiDecide(id);
  }
}
