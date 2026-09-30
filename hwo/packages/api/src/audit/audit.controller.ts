/**
 * 审计 API（M5 §6.2 反作弊，管理员专用）
 *
 * 端点：
 *   GET    /api/audit/replay/:matchId        重放验证单场比赛
 *   GET    /api/audit/match-anomaly/:matchId 检测单场比赛异常
 *   GET    /api/audit/scan                   批量扫描近期比赛异常
 *   POST   /api/audit/trade-anomaly          检测交易筹码失衡
 */

import { Controller, Get, Post, Body, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { AuditService } from "./audit.service.js";

@Controller("api/audit")
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get("replay/:matchId")
  replayMatch(@Param("matchId") matchId: string) {
    return this.auditService.replayMatch(matchId);
  }

  @Get("match-anomaly/:matchId")
  detectMatchAnomaly(@Param("matchId") matchId: string, @Query("homeScore") home: number, @Query("awayScore") away: number) {
    return this.auditService.detectMatchAnomaly(matchId, Number(home), Number(away));
  }

  @Get("scan")
  scanRecentMatches(@Query("limit") limit?: string) {
    return this.auditService.scanRecentMatches(limit ? Number(limit) : 100);
  }

  @Post("trade-anomaly")
  detectTradeAnomaly(@Body() body: { tradeId: string; offerValue: number; counterValue: number; threshold?: number }) {
    return this.auditService.detectTradeAnomaly(body.tradeId, body.offerValue, body.counterValue, body.threshold);
  }
}
