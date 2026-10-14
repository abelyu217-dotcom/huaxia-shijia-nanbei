import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { coins: true, credits: true },
    });
    return { userId, coins: user.coins, credits: user.credits };
  }

  async spendCoins(userId: string, amount: number, reason: string) {
    if (amount <= 0) throw new Error("金额必须大于 0");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.coins < amount) throw new Error("Coins 不足");
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { coins: { decrement: amount } },
      select: { coins: true, credits: true },
    });
    return { ...updated, spent: amount, reason };
  }

  async spendCredits(userId: string, amount: number, reason: string) {
    if (amount <= 0) throw new Error("金额必须大于 0");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.credits < amount) throw new Error("Credits 不足");
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: amount } },
      select: { coins: true, credits: true },
    });
    return { ...updated, spent: amount, reason };
  }

  async addCoins(userId: string, amount: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { coins: { increment: amount } },
      select: { coins: true, credits: true },
    });
  }

  async addCredits(userId: string, amount: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
      select: { coins: true, credits: true },
    });
  }

  /** 检查 VIP 状态给予每日 Coins 奖励 */
  async vipDailyBonus(userId: string): Promise<boolean> {
    const vip = await this.prisma.vipSubscription.findUnique({
      where: { userId },
    });
    if (!vip || vip.status !== "active" || vip.expiresAt < new Date()) return false;
    const bonus = vip.type === "monthly" ? 5000 : 15000;
    await this.addCoins(userId, bonus);
    return true;
  }
}
