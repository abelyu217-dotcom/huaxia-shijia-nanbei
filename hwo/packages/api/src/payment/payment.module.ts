import { Module } from "@nestjs/common";
import { PaymentController } from "./payment.controller.js";
import { PaymentService } from "./payment.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";

@Module({
  imports: [PrismaModule, AnalyticsModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
