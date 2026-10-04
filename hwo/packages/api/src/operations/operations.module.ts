/**
 * OperationsModule——运营中心模块
 *
 * 暴露 OperationsService 供 schedule.service 注入调用。
 */

import { Module } from "@nestjs/common";
import { OperationsController } from "./operations.controller.js";
import { OperationsService } from "./operations.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
