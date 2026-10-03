import { Module } from "@nestjs/common";
import { CosmeticController } from "./cosmetic.controller.js";
import { CosmeticService } from "./cosmetic.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [CosmeticController],
  providers: [CosmeticService],
  exports: [CosmeticService],
})
export class CosmeticModule {}
