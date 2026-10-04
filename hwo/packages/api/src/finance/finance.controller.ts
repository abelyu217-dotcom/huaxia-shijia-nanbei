/**
 * FinanceController —— v0.6 财务系统接口
 *
 * 对齐 basketpulse `/hk/finances` 布局：
 * - GET  /api/finance/:teamId/summary         余额 + 当日/周/赛季净额
 * - GET  /api/finance/:teamId/categories      收支分类汇总
 * - GET  /api/finance/:teamId/ledger           流水明细（分页 + 筛选）
 * - GET  /api/finance/:teamId/sponsors         赞助商列表
 */

import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { FinanceService } from "./finance.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("api/finance")
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly prisma: PrismaService,
  ) {}

  /** 余额 + 当日 / 本周 / 本赛季净额 */
  @Get(":teamId/summary")
  async summary(@Param("teamId") teamId: string) {
    return this.finance.getAccountSummary(teamId);
  }

  /** 收支分类汇总 */
  @Get(":teamId/categories")
  async categories(
    @Param("teamId") teamId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    let dayRange: { gte: number; lte: number } | undefined;
    if (from || to) {
      dayRange = {
        gte: from ? Number(from) : 1,
        lte: to ? Number(to) : 9999,
      };
    }
    return this.finance.getCategorySummary(teamId, dayRange);
  }

  /** 流水明细 */
  @Get(":teamId/ledger")
  async ledger(
    @Param("teamId") teamId: string,
    @Query("day") day?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("category") category?: string,
    @Query("incomeOnly") incomeOnly?: string,
    @Query("expenseOnly") expenseOnly?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.finance.getLedgerEntries(teamId, {
      day: day ? Number(day) : undefined,
      dayGte: from ? Number(from) : undefined,
      dayLte: to ? Number(to) : undefined,
      category: category || undefined,
      incomeOnly: incomeOnly === "true",
      expenseOnly: expenseOnly === "true",
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
  }

  /** 赞助商列表 */
  @Get(":teamId/sponsors")
  async sponsors(@Param("teamId") teamId: string) {
    return this.prisma.sponsor.findMany({
      where: { teamId },
      orderBy: { type: "asc" },
    });
  }
}
