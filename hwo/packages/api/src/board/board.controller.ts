/**
 * BoardController——董事会 REST 接口
 *
 * 对齐 basketpulse 董事会页：
 * - GET    /api/board/:teamId?seasonId=xxx    董事会总览（董事 + 赞助商 + 目标 + 提案 + 满意度）
 * - GET    /api/board/:teamId/sponsors        赞助商列表
 * - GET    /api/board/:teamId/directors        董事列表
 * - GET    /api/board/:teamId/goal?seasonId=xxx 赛季目标
 * - GET    /api/board/:teamId/proposals         提案列表
 * - POST   /api/board/proposals/:id/dismiss     经理忽略已 approved 提案
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { BoardService } from "./board.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("api/board")
@UseGuards(JwtAuthGuard)
export class BoardController {
  constructor(
    private readonly board: BoardService,
    private readonly prisma: PrismaService,
  ) {}

  /** 董事会总览 */
  @Get(":teamId")
  async getBoard(
    @Param("teamId") teamId: string,
    @Query("seasonId") seasonId?: string,
  ) {
    const sid = seasonId ?? (await this.getCurrentSeasonId());
    return this.board.getBoardView(teamId, sid);
  }

  /** 赞助商列表 */
  @Get(":teamId/sponsors")
  async sponsors(@Param("teamId") teamId: string) {
    const sid = await this.getCurrentSeasonId();
    const view = await this.board.getBoardView(teamId, sid);
    return view.sponsors;
  }

  /** 董事列表 */
  @Get(":teamId/directors")
  async directors(@Param("teamId") teamId: string) {
    const sid = await this.getCurrentSeasonId();
    const view = await this.board.getBoardView(teamId, sid);
    return view.directors;
  }

  /** 赛季目标 */
  @Get(":teamId/goal")
  async goal(
    @Param("teamId") teamId: string,
    @Query("seasonId") seasonId?: string,
  ) {
    const sid = seasonId ?? (await this.getCurrentSeasonId());
    const view = await this.board.getBoardView(teamId, sid);
    return view.goal;
  }

  /** 提案列表 */
  @Get(":teamId/proposals")
  async proposals(@Param("teamId") teamId: string) {
    const sid = await this.getCurrentSeasonId();
    const view = await this.board.getBoardView(teamId, sid);
    return view.proposals;
  }

  /** 经理忽略已 approved 提案 */
  @Post("proposals/:id/dismiss")
  async dismissProposal(
    @Param("id") proposalId: string,
    @Body() body: { teamId: string },
  ) {
    await this.board.dismissProposal(proposalId, body.teamId);
    return { ok: true };
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
