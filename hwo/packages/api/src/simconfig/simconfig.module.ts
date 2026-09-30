import { Module } from "@nestjs/common";
import { SimconfigService } from "./simconfig.service.js";
import { SimconfigController } from "./simconfig.controller.js";

@Module({
  providers: [SimconfigService],
  controllers: [SimconfigController],
  exports: [SimconfigService],
})
export class SimconfigModule {}
