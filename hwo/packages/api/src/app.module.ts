/**
 * 应用根模块
 */

import { Module } from "@nestjs/common";
import { SimModule } from "./sim/sim.module.js";
import { TeamModule } from "./team/team.module.js";
import { TacticModule } from "./tactic/tactic.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SeasonModule } from "./season/season.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AiManagerModule } from "./ai/ai-manager.module.js";
import { WorldModule } from "./world/world.module.js";
import { TradeModule } from "./trade/trade.module.js";
import { CareerModule } from "./career/career.module.js";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SimModule,
    TeamModule,
    TacticModule,
    SeasonModule,
    AiManagerModule,
    WorldModule,
    TradeModule,
    CareerModule,
  ],
})
export class AppModule {}
