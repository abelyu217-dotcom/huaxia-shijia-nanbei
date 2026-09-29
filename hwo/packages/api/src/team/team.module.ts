/**
 * team 模块——暴露球队相关端点
 *
 * 导出 TeamService 以便 SimModule 注入复用同一份缓存球队数据。
 * LineupController 负责阵容编辑端点（GET/PUT /api/teams/:id/lineup）。
 */

import { Module } from "@nestjs/common";
import { TeamController } from "./team.controller.js";
import { LineupController } from "./lineup.controller.js";
import { TeamService } from "./team.service.js";

@Module({
  controllers: [TeamController, LineupController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
