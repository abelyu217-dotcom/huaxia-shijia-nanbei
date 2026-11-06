import { Module } from "@nestjs/common";
import { DynastyService } from "./dynasty.service.js";
import { DynastyController } from "./dynasty.controller.js";

@Module({
  controllers: [DynastyController],
  providers: [DynastyService],
  exports: [DynastyService],
})
export class DynastyModule {}
