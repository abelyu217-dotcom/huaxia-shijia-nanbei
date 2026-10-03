/**
 * MarketController——人才市场端点
 *
 * v0.6 §批次6：
 * - GET  /api/market/overview                  市场总览（阶段 + 自由球员/职员 + 本队待入队）
 * - GET  /api/market/phase                     当前阶段
 * - GET  /api/market/free-players              自由球员列表
 * - GET  /api/market/free-staff                自由职员列表（可选 job 过滤）
 * - POST /api/market/sign/player/:playerId     签约自由球员
 * - POST /api/market/sign/staff/:proId         签约自由职员
 * - POST /api/market/pending/:pendingId/cancel 撤回受限市场签约
 *
 * 所有写操作需 JWT，且只能操作本队资源。
 */

import { Controller, ForbiddenException, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { MarketService } from "./market.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("api/market")
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly prisma: PrismaService,
  ) {}

  /** 当前用户绑定的球队 + 赛季上下文（简化：取最近一个赛季） */
  private async ensureContext(req: { user: { teamId: string | null } }): Promise<{ teamId: string; seasonId: string; day: number }> {
    if (!req.user.teamId) {
      throw new ForbiddenException("未绑定球队");
    }
    const season = await this.prisma.season.findFirst({
      orderBy: { currentDay: "desc" },
      select: { id: true, currentDay: true },
    });
    if (!season) {
      throw new ForbiddenException("当前没有进行中的赛季");
    }
    return { teamId: req.user.teamId, seasonId: season.id, day: season.currentDay };
  }

  @UseGuards(JwtAuthGuard)
  @Get("overview")
  async overview(@Request() req: { user: { teamId: string | null } }) {
    const ctx = await this.ensureContext(req);
    return this.market.getOverview(ctx.teamId, ctx.seasonId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("phase")
  async phase(@Request() req: { user: { teamId: string | null } }) {
    const ctx = await this.ensureContext(req);
    return this.market.getPhase(ctx.seasonId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("free-players")
  async freePlayers(@Request() req: { user: { teamId: string | null } }) {
    const ctx = await this.ensureContext(req);
    return this.market.listFreeAgentPlayers(ctx.teamId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("free-staff")
  async freeStaff(
    @Request() req: { user: { teamId: string | null } },
    @Query("job") job?: string,
  ) {
    const ctx = await this.ensureContext(req);
    const all = await this.market.listFreeAgentStaff(ctx.teamId);
    if (!job) return all;
    return all.filter((s) => s.job === job);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sign/player/:playerId")
  async signPlayer(
    @Param("playerId") playerId: string,
    @Request() req: { user: { teamId: string | null } },
  ) {
    const ctx = await this.ensureContext(req);
    return this.market.signFreeAgentPlayer(ctx.teamId, playerId, ctx.seasonId, ctx.day);
  }

  @UseGuards(JwtAuthGuard)
  @Post("sign/staff/:proId")
  async signStaff(
    @Param("proId") proId: string,
    @Request() req: { user: { teamId: string | null } },
  ) {
    const ctx = await this.ensureContext(req);
    return this.market.signFreeAgentStaff(ctx.teamId, proId, ctx.seasonId, ctx.day);
  }

  @UseGuards(JwtAuthGuard)
  @Post("pending/:pendingId/cancel")
  async cancelPending(
    @Param("pendingId") pendingId: string,
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (!req.user.teamId) throw new ForbiddenException("未绑定球队");
    await this.market.cancelPendingSigning(pendingId, req.user.teamId);
    return { ok: true };
  }
}
