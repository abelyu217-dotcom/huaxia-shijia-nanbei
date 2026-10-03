/**
 * Analytics 服务（M5 §6.3 留存与数据观测）
 *
 * 职责：
 *   1. 埋点：记录用户行为 / 系统事件到 AnalyticsEvent 表
 *   2. 日活快照：upsert DailyActiveSnapshot，维护 (userId, date) 唯一行
 *   3. 留存漏斗：基于 DailyActiveSnapshot 计算 D1/D7/D30 留存
 *   4. DAU/WAU/MAU 概览：用于 Grafana 看板
 *
 * 设计要点：
 *   - 埋点异步落库（fire-and-forget），不阻塞主流程
 *   - 日活快照使用 upsert 保证幂等（同一天多次调用只更新一行）
 *   - 高频事件（PBP）不入此表，仅记录用户主动行为 + 关键节点
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** 埋点事件分类 */
export type AnalyticsCategory = "auth" | "game" | "commerce" | "retention" | "system";

/** 埋点参数 */
export interface TrackEventParams {
  userId?: string | null;
  event: string;
  category: AnalyticsCategory;
  properties?: Record<string, unknown>;
  /** 覆盖时间戳（默认 now），主要用于回填 */
  occurredAt?: Date;
}

/** 日活快照更新参数 */
export interface TouchDailyActiveParams {
  userId: string;
  /** 是否发生付费 */
  paid?: boolean;
  /** 付费金额（分） */
  paidAmount?: number;
  /** 是否计入游戏行为（lineup_edit / sim_match 等） */
  isGameAction?: boolean;
  /** 覆盖日期（默认今天 UTC） */
  date?: Date;
}

/** 留存漏斗结果 */
export interface RetentionFunnel {
  cohortDate: Date;
  cohortSize: number;
  d1: number;
  d7: number;
  d30: number;
  d1Rate: number;
  d7Rate: number;
  d30Rate: number;
}

/** DAU 概览 */
export interface DauOverview {
  date: Date;
  dau: number;
  wau: number;
  mau: number;
  paidUsers: number;
  totalActions: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  /** 取 UTC 日期（截断到当天 00:00:00 UTC） */
  private utcDay(d: Date = new Date()): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /** 埋点：记录事件 + 同步更新日活快照 */
  async track(params: TrackEventParams): Promise<void> {
    const occurredAt = params.occurredAt ?? new Date();
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          userId: params.userId ?? null,
          event: params.event,
          category: params.category,
          properties: params.properties
            ? (params.properties as unknown as import("@prisma/client").Prisma.InputJsonValue)
            : undefined,
          occurredAt,
        },
      });

      // 用户事件同步更新日活快照（系统事件无 userId 不更新）
      if (params.userId) {
        await this.touchDailyActive({
          userId: params.userId,
          isGameAction: params.category === "game" || params.category === "commerce",
          paid: params.category === "commerce",
          date: occurredAt,
        });
      }
    } catch (err) {
      // 埋点失败不阻塞主流程
      this.logger.warn(`埋点失败 ${params.event}: ${(err as Error).message}`);
    }
  }

  /** 更新日活快照（幂等 upsert） */
  async touchDailyActive(params: TouchDailyActiveParams): Promise<void> {
    const date = this.utcDay(params.date ?? new Date());
    const existing = await this.prisma.dailyActiveSnapshot.findUnique({
      where: { userId_date: { userId: params.userId, date } },
    });

    if (existing) {
      await this.prisma.dailyActiveSnapshot.update({
        where: { id: existing.id },
        data: {
          paid: existing.paid || (params.paid ?? false),
          paidAmount: existing.paidAmount + (params.paidAmount ?? 0),
          actions: existing.actions + (params.isGameAction ? 1 : 0),
        },
      });
    } else {
      await this.prisma.dailyActiveSnapshot.create({
        data: {
          userId: params.userId,
          date,
          paid: params.paid ?? false,
          paidAmount: params.paidAmount ?? 0,
          actions: params.isGameAction ? 1 : 0,
        },
      });
    }
  }

  /** 计算指定日期的 DAU 概览 */
  async getDauOverview(date: Date = new Date()): Promise<DauOverview> {
    const day = this.utcDay(date);
    const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const weekAgo = new Date(day.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(day.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [dau, wau, mau, paidAgg, actionsAgg] = await Promise.all([
      this.prisma.dailyActiveSnapshot.count({ where: { date: { gte: day, lt: dayEnd } } }),
      this.prisma.dailyActiveSnapshot.count({ where: { date: { gte: weekAgo, lt: dayEnd } } }),
      this.prisma.dailyActiveSnapshot.count({ where: { date: { gte: monthAgo, lt: dayEnd } } }),
      this.prisma.dailyActiveSnapshot.aggregate({
        _sum: { paidAmount: true },
        _count: { paid: true },
        where: { date: { gte: day, lt: dayEnd }, paid: true },
      }),
      this.prisma.dailyActiveSnapshot.aggregate({
        _sum: { actions: true },
        where: { date: { gte: day, lt: dayEnd } },
      }),
    ]);

    return {
      date: day,
      dau,
      wau,
      mau,
      paidUsers: paidAgg._count.paid,
      totalActions: actionsAgg._sum.actions ?? 0,
    };
  }

  /**
   * 留存漏斗分析：以某日为 cohort 基准，计算后续 1/7/30 日留存
   *
   * cohort = 当日活跃用户集合
   * dN = cohort 中在前 N 日仍活跃的用户数（在 cohort+N 日有 snapshot）
   */
  async getRetentionFunnel(cohortDate: Date = new Date()): Promise<RetentionFunnel> {
    const day = this.utcDay(cohortDate);
    const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    // 1. 找到 cohort 用户列表
    const cohortSnapshots = await this.prisma.dailyActiveSnapshot.findMany({
      where: { date: { gte: day, lt: dayEnd } },
      select: { userId: true },
    });
    const cohortUserIds = cohortSnapshots.map((s) => s.userId);
    const cohortSize = cohortUserIds.length;

    if (cohortSize === 0) {
      return {
        cohortDate: day,
        cohortSize: 0,
        d1: 0,
        d7: 0,
        d30: 0,
        d1Rate: 0,
        d7Rate: 0,
        d30Rate: 0,
      };
    }

    // 2. 计算各留存窗口（D1/D7/D30）
    const calcWindow = async (nDays: number): Promise<number> => {
      const windowStart = new Date(day.getTime() + nDays * 24 * 60 * 60 * 1000);
      const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
      const retained = await this.prisma.dailyActiveSnapshot.findMany({
        where: {
          userId: { in: cohortUserIds },
          date: { gte: windowStart, lt: windowEnd },
        },
        select: { userId: true },
        distinct: ["userId"],
      });
      return retained.length;
    };

    const [d1, d7, d30] = await Promise.all([calcWindow(1), calcWindow(7), calcWindow(30)]);

    return {
      cohortDate: day,
      cohortSize,
      d1,
      d7,
      d30,
      d1Rate: d1 / cohortSize,
      d7Rate: d7 / cohortSize,
      d30Rate: d30 / cohortSize,
    };
  }

  /**
   * 批量计算最近 N 天的留存序列（用于看板折线图）
   */
  async getRetentionSeries(days = 14, retentionType: "d1" | "d7" | "d30" = "d1"): Promise<Array<{ date: Date; rate: number; cohortSize: number }>> {
    const today = this.utcDay();
    const series: Array<{ date: Date; rate: number; cohortSize: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const cohortDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const funnel = await this.getRetentionFunnel(cohortDate);
      const rate = retentionType === "d1" ? funnel.d1Rate : retentionType === "d7" ? funnel.d7Rate : funnel.d30Rate;
      series.push({ date: cohortDate, rate, cohortSize: funnel.cohortSize });
    }

    return series;
  }

  /**
   * 查询事件流（用于看板事件列表 / 调试）
   */
  async listEvents(params: {
    category?: AnalyticsCategory;
    event?: string;
    userId?: string;
    limit?: number;
    startTime?: Date;
    endTime?: Date;
  }) {
    const where: Record<string, unknown> = {};
    if (params.category) where.category = params.category;
    if (params.event) where.event = params.event;
    if (params.userId) where.userId = params.userId;
    if (params.startTime || params.endTime) {
      where.occurredAt = {
        ...(params.startTime ? { gte: params.startTime } : {}),
        ...(params.endTime ? { lte: params.endTime } : {}),
      };
    }
    return this.prisma.analyticsEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: Math.min(params.limit ?? 100, 1000),
    });
  }
}
