import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const VIP_PLANS = {
  monthly: { price: 30, durationDays: 30, coins: 5000 },
  seasonal: { price: 80, durationDays: 90, coins: 15000 },
};

@Injectable()
export class VipService {
  constructor(private prisma: PrismaService) {}

  async getSubscription(userId: string) {
    const sub = await this.prisma.vipSubscription.findUnique({
      where: { userId },
    });
    if (!sub) return { active: false, type: null, expiresAt: null };
    const active = sub.status === "active" && sub.expiresAt > new Date();
    return { active, type: sub.type, expiresAt: sub.expiresAt };
  }

  async subscribe(userId: string, type: "monthly" | "seasonal") {
    const plan = VIP_PLANS[type];
    if (!plan) throw new BadRequestException("无效的 VIP 类型");

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.credits < plan.price) {
      throw new BadRequestException("Credits 不足");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: plan.price } },
      }),
    ]);

    const existing = await this.prisma.vipSubscription.findUnique({
      where: { userId },
    });

    if (existing) {
      return this.prisma.vipSubscription.update({
        where: { userId },
        data: {
          type,
          status: "active",
          startedAt: new Date(),
          expiresAt,
        },
      });
    }

    return this.prisma.vipSubscription.create({
      data: { userId, type, status: "active", expiresAt },
    });
  }

  /** 检查 VIP 是否有效（供其他模块调用） */
  async isActive(userId: string): Promise<boolean> {
    const sub = await this.prisma.vipSubscription.findUnique({
      where: { userId },
    });
    return !!sub && sub.status === "active" && sub.expiresAt > new Date();
  }

  getPlans() {
    return VIP_PLANS;
  }
}
