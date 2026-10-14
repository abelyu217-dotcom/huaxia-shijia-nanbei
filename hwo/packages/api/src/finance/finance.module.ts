import { Module } from "@nestjs/common";
import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
