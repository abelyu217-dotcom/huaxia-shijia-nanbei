/**
 * team 模块——暴露球队相关端点
 *
 * 导出 TeamService 以便 SimModule 注入复用同一份缓存球队数据。
 */

import { Module } from "@nestjs/common";
import { TeamController } from "./team.controller.js";
import { TeamService } from "./team.service.js";

@Module({
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
