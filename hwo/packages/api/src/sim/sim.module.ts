/**
 * sim 模块——暴露比赛模拟相关端点
 */

import { Module } from "@nestjs/common";
import { SimController } from "./sim.controller.js";
import { SimService } from "./sim.service.js";
import { TeamModule } from "../team/team.module.js";
import { SeasonModule } from "../season/season.module.js";

@Module({
  imports: [TeamModule, SeasonModule],
  controllers: [SimController],
  providers: [SimService],
  exports: [SimService],
})
export class SimModule {}
