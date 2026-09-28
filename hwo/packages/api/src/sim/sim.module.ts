/**
 * sim 模块——暴露比赛模拟相关端点
 */

import { Module } from "@nestjs/common";
import { SimController } from "./sim.controller.js";
import { TeamModule } from "../team/team.module.js";

@Module({
  imports: [TeamModule],
  controllers: [SimController],
})
export class SimModule {}
