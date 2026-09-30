import { Module } from "@nestjs/common";
import { PaymentController } from "./payment.controller.js";
import { PaymentService } from "./payment.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
