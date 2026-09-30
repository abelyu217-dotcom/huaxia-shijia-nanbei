import { Module, forwardRef } from "@nestjs/common";
import { SeasonController } from "./season.controller.js";
import { SeasonService } from "./season.service.js";
import { ScheduleService } from "./schedule.service.js";
import { SimModule } from "../sim/sim.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AiManagerModule } from "../ai/ai-manager.module.js";
import { CareerModule } from "../career/career.module.js";
import { AcademyModule } from "../academy/academy.module.js";
import { ContractModule } from "../contract/contract.module.js";
import { DraftModule } from "../draft/draft.module.js";

@Module({
  imports: [
    forwardRef(() => SimModule),
    AuthModule,
    AiManagerModule,
    forwardRef(() => CareerModule),
    forwardRef(() => AcademyModule),
    forwardRef(() => ContractModule),
    DraftModule,
  ],
  controllers: [SeasonController],
  providers: [SeasonService, ScheduleService],
  exports: [SeasonService, ScheduleService],
})
export class SeasonModule {}
