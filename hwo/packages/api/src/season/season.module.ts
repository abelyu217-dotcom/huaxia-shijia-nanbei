import { Module, forwardRef } from "@nestjs/common";
import { SeasonController } from "./season.controller.js";
import { SeasonService } from "./season.service.js";
import { ScheduleService } from "./schedule.service.js";
import { SimModule } from "../sim/sim.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AiManagerModule } from "../ai/ai-manager.module.js";
import { CareerModule } from "../career/career.module.js";

@Module({
  imports: [forwardRef(() => SimModule), AuthModule, AiManagerModule, forwardRef(() => CareerModule)],
  controllers: [SeasonController],
  providers: [SeasonService, ScheduleService],
  exports: [SeasonService, ScheduleService],
})
export class SeasonModule {}
