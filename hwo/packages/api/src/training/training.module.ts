import { Module, forwardRef } from "@nestjs/common";
import { TrainingController } from "./training.controller.js";
import { TrainingService } from "./training.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { FacilityModule } from "../facility/facility.module.js";
import { StaffModule } from "../staff/staff.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [
    PrismaModule,
    FacilityModule,
    forwardRef(() => StaffModule),
    AuthModule,
  ],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
