/**
 * Analytics API（M5 §6.3 留存与数据观测）
 *
 * 端点：
 *   POST   /api/analytics/track                 埋点（前端 / 内部调用）
 *   GET    /api/analytics/dau                  获取 DAU 概览（含 WAU/MAU/付费数）
 *   GET    /api/analytics/retention            获取指定 cohort 留存漏斗
 *   GET    /api/analytics/retention/series     最近 N 天留存序列
 *   GET    /api/analytics/events               事件流查询
 *
 * 权限：
 *   - track：用户身份（JwtAuth），可记录自己的行为
 *   - dau / retention / events：管理员（生产环境应加 AdminGuard）
 */

import { Controller, Post, Get, Body, Query, UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { AnalyticsService, type AnalyticsCategory } from "./analytics.service.js";

@Controller("api/analytics")
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Post("track")
  async track(
    @Req() req: { user?: { sub?: string } },
    @Body() body: { event: string; category: AnalyticsCategory; properties?: Record<string, unknown>; userId?: string },
  ) {
    const userId = body.userId ?? req.user?.sub ?? null;
    await this.analyticsService.track({
      userId,
      event: body.event,
      category: body.category,
      properties: body.properties,
    });
    return { ok: true };
  }

  @Get("dau")
  dau(@Query("date") date?: string) {
    return this.analyticsService.getDauOverview(date ? new Date(date) : new Date());
  }

  @Get("retention")
  retention(@Query("date") date?: string) {
    return this.analyticsService.getRetentionFunnel(date ? new Date(date) : new Date());
  }

  @Get("retention/series")
  retentionSeries(
    @Query("days") days?: string,
    @Query("type") type?: "d1" | "d7" | "d30",
  ) {
    return this.analyticsService.getRetentionSeries(
      days ? parseInt(days, 10) : 14,
      type ?? "d1",
    );
  }

  @Get("events")
  events(
    @Query("category") category?: AnalyticsCategory,
    @Query("event") event?: string,
    @Query("userId") userId?: string,
    @Query("limit") limit?: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
  ) {
    return this.analyticsService.listEvents({
      category,
      event,
      userId,
      limit: limit ? parseInt(limit, 10) : 100,
      startTime: start ? new Date(start) : undefined,
      endTime: end ? new Date(end) : undefined,
    });
  }
}
