/**
 * stats 模块——球员赛季累计统计
 *
 * 端点：
 *   GET /api/stats/team/:teamId   球队球员赛季累计技术统计（聚合已结算比赛）
 */

import { Module } from "@nestjs/common";
import { StatsController } from "./stats.controller.js";
import { StatsService } from "./stats.service.js";

@Module({
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
