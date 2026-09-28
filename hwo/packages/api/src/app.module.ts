/**
 * 应用根模块
 */

import { Module } from "@nestjs/common";
import { SimModule } from "./sim/sim.module.js";
import { TeamModule } from "./team/team.module.js";
import { TacticModule } from "./tactic/tactic.module.js";

@Module({
  imports: [SimModule, TeamModule, TacticModule],
})
export class AppModule {}
