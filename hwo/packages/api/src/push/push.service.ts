import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  constructor(private prisma: PrismaService) {}

  async subscribe(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    // 删除旧的同一 endpoint
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: subscription.endpoint },
    });
    return this.prisma.pushSubscription.create({
      data: { userId, endpoint: subscription.endpoint, keys: subscription.keys },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { success: true };
  }

  /** 发送推送通知（沙箱模式：仅记录日志，不实际发送） */
  async notify(userId: string, payload: { title: string; body: string; data?: Record<string, unknown> }) {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subs.length === 0) {
      this.logger.log(`用户 ${userId} 无推送订阅，跳过：${payload.title}`);
      return { sent: 0 };
    }
    // 实际环境调用 web-push 库发送
    // 沙箱模式：仅日志
    this.logger.log(`[Push] → 用户 ${userId}：${payload.title} — ${payload.body}`);
    return { sent: subs.length, payload };
  }

  /** 批量推送（赛季结算后批量通知） */
  async notifyBatch(userIds: string[], payload: { title: string; body: string; data?: Record<string, unknown> }) {
    let sent = 0;
    for (const userId of userIds) {
      const result = await this.notify(userId, payload);
      sent += result.sent;
    }
    return { sent, total: userIds.length };
  }
}
