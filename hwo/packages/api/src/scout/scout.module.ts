import { Module } from "@nestjs/common";
import { ScoutService } from "./scout.service.js";
import { ScoutController } from "./scout.controller.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [ScoutController],
  providers: [ScoutService],
  exports: [ScoutService],
})
export class ScoutModule {}
