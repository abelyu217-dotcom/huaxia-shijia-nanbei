/**
 * PrController——公关部 REST 接口
 *
 * - GET    /api/pr/:teamId/overview?seasonId=xxx  公关部总览（讯息+新闻+公告+未读数）
 * - GET    /api/pr/:teamId/messages?limit=30       球队讯息列表（支持 unreadOnly）
 * - GET    /api/pr/:teamId/messages/unread          未读讯息数
 * - POST   /api/pr/messages/:id/read               标记单条讯息已读
 * - POST   /api/pr/:teamId/messages/read-all       标记全部已读
 * - GET    /api/pr/news?seasonId=xxx&category=game  媒体新闻列表
 * - GET    /api/pr/announcements?seasonId=xxx       联盟公告列表
 */

import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PrService } from "./pr.service.js";

@Controller("api/pr")
@UseGuards(JwtAuthGuard)
export class PrController {
  constructor(
    private readonly pr: PrService,
    private readonly prisma: PrismaService,
  ) {}

  /** 公关部总览 */
  @Get(":teamId/overview")
  async overview(
    @Param("teamId") teamId: string,
    @Query("seasonId") seasonId?: string,
  ) {
    const sid = seasonId ?? (await this.getCurrentSeasonId());
    return this.pr.getOverview(teamId, sid);
  }

  /** 球队讯息列表 */
  @Get(":teamId/messages")
  async messages(
    @Param("teamId") teamId: string,
    @Query("limit") limit?: string,
    @Query("unreadOnly") unreadOnly?: string,
  ) {
    return this.pr.listMessages(teamId, {
      limit: limit ? parseInt(limit, 10) : 30,
      unreadOnly: unreadOnly === "true",
    });
  }

  /** 未读讯息数 */
  @Get(":teamId/messages/unread")
  async unread(@Param("teamId") teamId: string) {
    const count = await this.pr.countUnread(teamId);
    return { count };
  }

  /** 标记单条讯息已读 */
  @Post("messages/:id/read")
  async markRead(@Param("id") id: string, @Body() body: { teamId: string }) {
    await this.pr.markRead(id, body.teamId);
    return { ok: true };
  }

  /** 标记全部已读 */
  @Post(":teamId/messages/read-all")
  async markAllRead(@Param("teamId") teamId: string) {
    return this.pr.markAllRead(teamId);
  }

  /** 媒体新闻列表 */
  @Get("news")
  async news(
    @Query("seasonId") seasonId?: string,
    @Query("category") category?: string,
    @Query("limit") limit?: string,
  ) {
    return this.pr.listNews({
      seasonId,
      category,
      limit: limit ? parseInt(limit, 10) : 30,
    });
  }

  /** 联盟公告列表 */
  @Get("announcements")
  async announcements(
    @Query("seasonId") seasonId?: string,
    @Query("category") category?: string,
    @Query("limit") limit?: string,
  ) {
    return this.pr.listAnnouncements({
      seasonId,
      category,
      limit: limit ? parseInt(limit, 10) : 30,
    });
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
