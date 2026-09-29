import { Module } from "@nestjs/common";
import { SeasonController } from "./season.controller.js";
import { SeasonService } from "./season.service.js";

@Module({
  controllers: [SeasonController],
  providers: [SeasonService],
  exports: [SeasonService],
})
export class SeasonModule {}
