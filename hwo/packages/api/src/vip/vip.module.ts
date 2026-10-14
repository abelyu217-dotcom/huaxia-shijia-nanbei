import { Module } from "@nestjs/common";
import { VipController } from "./vip.controller.js";
import { VipService } from "./vip.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [VipController],
  providers: [VipService],
  exports: [VipService],
})
export class VipModule {}
