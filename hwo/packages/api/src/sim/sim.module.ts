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
import { TacticModule } from "../tactic/tactic.module.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";

@Module({
  imports: [TeamModule, forwardRef(() => SeasonModule), TacticModule, AnalyticsModule],
  controllers: [SimController, MatchStreamController],
  providers: [SimService, MatchStreamService],
  exports: [SimService],
})
export class SimModule {}
