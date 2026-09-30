import { Controller, Get, Post, Body, UseGuards, Request, Param } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PaymentService } from "./payment.service.js";

@Controller("api/payment")
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Get("packages")
  getPackages() {
    return this.paymentService.getPackages();
  }

  @Post("create-order")
  createOrder(
    @Request() req: any,
    @Body() body: { packageId: string; provider: "stripe" | "alipay" | "wechat" },
  ) {
    return this.paymentService.createOrder(req.user.id, body.packageId, body.provider);
  }

  @Post(":orderId/verify")
  verifyPayment(
    @Param("orderId") orderId: string,
    @Body() body: { providerOrderId: string },
  ) {
    return this.paymentService.verifyPayment(orderId, body.providerOrderId);
  }

  @Post(":orderId/sandbox-complete")
  sandboxComplete(@Param("orderId") orderId: string) {
    return this.paymentService.sandboxComplete(orderId);
  }

  @Get(":orderId")
  getOrder(@Param("orderId") orderId: string) {
    return this.paymentService.getOrder(orderId);
  }
}
