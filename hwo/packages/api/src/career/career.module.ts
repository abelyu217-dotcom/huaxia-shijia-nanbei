/**
 * career 模块——球员生涯弧线
 */

import { Module } from "@nestjs/common";
import { CareerController } from "./career.controller.js";
import { CareerService } from "./career.service.js";
import { FacilityModule } from "../facility/facility.module.js";

@Module({
  imports: [FacilityModule],
  controllers: [CareerController],
  providers: [CareerService],
  exports: [CareerService],
})
export class CareerModule {}
