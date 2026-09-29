/**
 * sim 模块——暴露比赛模拟相关端点
 */

import { Module, forwardRef } from "@nestjs/common";
import { SimController } from "./sim.controller.js";
import { SimService } from "./sim.service.js";
import { MatchStreamController } from "./match-stream.controller.js";
import { MatchStreamService } from "./match-stream.service.js";
import { TeamModule } from "../team/team.module.js";
import { SeasonModule } from "../season/season.module.js";

@Module({
  imports: [TeamModule, forwardRef(() => SeasonModule)],
  controllers: [SimController, MatchStreamController],
  providers: [SimService, MatchStreamService],
  exports: [SimService],
})
export class SimModule {}
