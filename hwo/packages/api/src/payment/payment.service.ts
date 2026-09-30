import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** Credits 购买套餐 */
const CREDIT_PACKAGES = [
  { id: "starter", credits: 100, priceCents: 600, label: "新手包" },
  { id: "value", credits: 300, priceCents: 1500, label: "超值包", bonus: 30 },
  { id: "premium", credits: 600, priceCents: 3000, label: "高级包", bonus: 80 },
  { id: "mega", credits: 1200, priceCents: 6000, label: "巨鲸包", bonus: 200 },
];

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) {}

  getPackages() {
    return CREDIT_PACKAGES;
  }

  /** 创建订单（沙箱模式：直接返回模拟支付链接） */
  async createOrder(userId: string, packageId: string, provider: "stripe" | "alipay" | "wechat") {
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) throw new BadRequestException("无效的套餐");

    const order = await this.prisma.paymentOrder.create({
      data: {
        userId,
        amount: pkg.priceCents,
        credits: pkg.credits + (pkg.bonus || 0),
        provider,
        status: "pending",
      },
    });

    // 沙箱模式：返回模拟支付 URL
    const sandboxUrl = provider === "stripe"
      ? `https://checkout.stripe.com/sandbox/${order.id}`
      : `https://open.alipay.com/sandbox/${order.id}`;

    return {
      orderId: order.id,
      packageId: pkg.id,
      credits: order.credits,
      amount: order.amount,
      provider,
      checkoutUrl: sandboxUrl,
      sandbox: true,
    };
  }

  /** 验证支付回调（沙箱模式：标记已支付并发放 Credits） */
  async verifyPayment(orderId: string, providerOrderId: string) {
    const order = await this.prisma.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.status === "paid") throw new BadRequestException("订单已支付");

    await this.prisma.$transaction([
      this.prisma.paymentOrder.update({
        where: { id: orderId },
        data: { status: "paid", paidAt: new Date(), providerOrderId },
      }),
      this.prisma.user.update({
        where: { id: order.userId },
        data: { credits: { increment: order.credits } },
      }),
    ]);

    return { success: true, orderId, credits: order.credits };
  }

  /** 模拟支付完成（沙箱专用：一键完成支付+发放） */
  async sandboxComplete(orderId: string) {
    return this.verifyPayment(orderId, `SANDBOX_${orderId}`);
  }

  async getOrder(orderId: string) {
    return this.prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
  }
}
