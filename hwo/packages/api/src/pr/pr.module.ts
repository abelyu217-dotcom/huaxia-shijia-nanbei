/**
 * PrModule——公关部模块
 *
 * 暴露 PrService 供 schedule.service 注入调用（每日生成新闻）。
 */

import { Module } from "@nestjs/common";
import { PrController } from "./pr.controller.js";
import { PrService } from "./pr.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [PrController],
  providers: [PrService],
  exports: [PrService],
})
export class PrModule {}
