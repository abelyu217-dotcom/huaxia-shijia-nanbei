/**
 * 应用根模块
 */

import { Module } from "@nestjs/common";
import { SimModule } from "./sim/sim.module.js";
import { TeamModule } from "./team/team.module.js";
import { TacticModule } from "./tactic/tactic.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SeasonModule } from "./season/season.module.js";

@Module({
  imports: [PrismaModule, SimModule, TeamModule, TacticModule, SeasonModule],
})
export class AppModule {}
