/**
 * OperationsService——运营中心服务（球迷中心 + 球迷事件流）
 *
 * v0.6 §批次5 设计：
 * - FanCenter：每支球队一条记录（fanCount / morale / loyalty / 季票 / 商品收入）
 * - FanEvent：每日根据比赛结果/交易/签约/丑闻自动生成事件，影响 morale
 * - morale 公式：胜 +3 / 败 -2 / 交易 +1~-3 / 签约明星 +5 / 丑闻 -10
 * - 季票销售：morale > 60 时季票销量 = fanCount × 0.4 × (morale/100)
 *
 * 参见：HW0_系统调整方案_v2.md §批次5
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

// ── 视图类型 ──

export interface FanCenterView {
  teamId: string;
  fanCount: number;
  morale: number;
  loyalty: number;
  seasonTicketsSold: number;
  merchandiseRevenue: number;
  updatedAt: string;
}

export interface FanEventView {
  id: string;
  teamId: string;
  seasonId: string;
  day: number;
  type: string;
  impact: number;
  note: string | null;
  createdAt: string;
}

export interface OperationsOverviewView {
  fanCenter: FanCenterView;
  recentEvents: FanEventView[];
  // 球迷中心关键指标摘要
  moraleTrend: "up" | "down" | "stable";
  fanGrowth: number; // 近 7 日 fanCount 增量
  projectedSeasonTickets: number;
}

// ── 事件影响配置 ──

const EVENT_IMPACT: Record<string, number> = {
  win: 3,
  loss: -2,
  trade: -1,
  signing: 5,
  firing: -3,
  title: 15,
  scandal: -10,
};

const EVENT_LABEL: Record<string, string> = {
  win: "比赛胜利",
  loss: "比赛失利",
  trade: "球员交易",
  signing: "明星签约",
  firing: "教练/职员解雇",
  title: "夺冠",
  scandal: "丑闻",
};

const clamp = (v: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, Math.round(v)));

@Injectable()
export class OperationsService implements OnModuleInit {
  private readonly logger = new Logger(OperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 启动时为缺 FanCenter 的球队初始化 */
  async onModuleInit(): Promise<void> {
    try {
      const created = await this.ensureFanCenterForAllTeams();
      if (created > 0) {
        this.logger.log(`[Operations] 启动时为 ${created} 支球队初始化了球迷中心`);
      }
    } catch (e) {
      this.logger.warn(
        `[Operations] 球迷中心初始化失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ─── 查询 ───

  /** 球队球迷中心 */
  async getFanCenter(teamId: string): Promise<FanCenterView> {
    const fc = await this.prisma.fanCenter.upsert({
      where: { teamId },
      create: { teamId },
      update: {},
    });
    return this.toView(fc);
  }

  /** 球队最近球迷事件（默认 30 条） */
  async listFanEvents(teamId: string, seasonId: string, limit = 30): Promise<FanEventView[]> {
    const rows = await this.prisma.fanEvent.findMany({
      where: { teamId, seasonId },
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      take: Math.min(limit, 100),
    });
    return rows.map((r) => this.toEventView(r));
  }

  /** 运营中心总览 */
  async getOverview(teamId: string, seasonId: string): Promise<OperationsOverviewView> {
    const [fanCenter, recentEvents] = await Promise.all([
      this.getFanCenter(teamId),
      this.listFanEvents(teamId, seasonId, 30),
    ]);

    // 计算 morale 趋势：近 5 个事件的 impact 之和
    const recentImpact = recentEvents.slice(0, 5).reduce((s, e) => s + e.impact, 0);
    const moraleTrend: "up" | "down" | "stable" =
      recentImpact > 3 ? "up" : recentImpact < -3 ? "down" : "stable";

    // 近 7 日 fanCount 增量（基于事件估算）
    const last7 = recentEvents.filter((e) => e.day >= 0).slice(0, 7);
    const fanGrowth = last7.reduce((s, e) => {
      if (e.impact > 0) return s + Math.round(e.impact * 10);
      return s + Math.round(e.impact * 5);
    }, 0);

    // 预测季票销量：fanCount × 0.4 × (morale/100)
    const projectedSeasonTickets = Math.round(
      fanCenter.fanCount * 0.4 * (fanCenter.morale / 100),
    );

    return {
      fanCenter,
      recentEvents,
      moraleTrend,
      fanGrowth,
      projectedSeasonTickets,
    };
  }

  // ─── 每日推进：根据当日比赛/事件更新球迷中心 ───

  /** 每日为所有球队更新球迷中心 + 生成球迷事件 */
  async runDailyAllTeams(seasonId: string, day: number): Promise<void> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return;

    const teams = await this.prisma.team.findMany({
      where: { id: { not: { startsWith: "DRAFT_POOL_" } } },
      select: { id: true },
    });

    for (const t of teams) {
      try {
        await this.runDailyForTeam(t.id, seasonId, day);
      } catch (e) {
        this.logger.warn(
          `[Operations] 球队 ${t.id} 球迷中心结算失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  /** 单支球队每日：根据当日比赛结果生成事件 + 更新 morale/fanCount */
  async runDailyForTeam(teamId: string, seasonId: string, day: number): Promise<void> {
    // 1. 查询当日比赛（通过 Match 表关联查询，匹配该球队主客场）
    const todayMatches = await this.prisma.match.findMany({
      where: {
        seasonId,
        day,
        status: "settled",
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: { result: true },
    });

    let moraleDelta = 0;
    const eventsToCreate: { type: string; impact: number; note: string }[] = [];

    for (const m of todayMatches) {
      if (!m.result) continue;
      const isWin = m.result.winnerId === teamId;
      const type = isWin ? "win" : "loss";
      const impact = EVENT_IMPACT[type]!;
      moraleDelta += impact;
      eventsToCreate.push({
        type,
        impact,
        note: isWin ? "今日比赛胜利" : "今日比赛失利",
      });
    }

    // 2. 随机生成低概率事件（丑闻/签约等）
    const rand = Math.random();
    if (rand < 0.02) {
      // 2% 概率丑闻
      const impact = EVENT_IMPACT.scandal!;
      moraleDelta += impact;
      eventsToCreate.push({
        type: "scandal",
        impact,
        note: "球队内部丑闻曝光，球迷情绪受挫",
      });
    } else if (rand < 0.05) {
      // 3% 概率明星签约
      const impact = EVENT_IMPACT.signing!;
      moraleDelta += impact;
      eventsToCreate.push({
        type: "signing",
        impact,
        note: "球队宣布签约明星球员，球迷振奋",
      });
    }

    // 3. 写入 FanEvent
    if (eventsToCreate.length > 0) {
      await this.prisma.fanEvent.createMany({
        data: eventsToCreate.map((e) => ({
          teamId,
          seasonId,
          day,
          type: e.type,
          impact: e.impact,
          note: e.note,
        })),
      });
    }

    // 4. 更新 FanCenter（morale + fanCount 增长）
    if (moraleDelta !== 0 || todayMatches.length > 0) {
      const fc = await this.prisma.fanCenter.upsert({
        where: { teamId },
        create: { teamId },
        update: {},
      });

      const newMorale = clamp(fc.morale + moraleDelta);
      // fanCount 微增长：morale > 60 时每日 +morale/10，否则 -1
      const fanGrowth = newMorale > 60 ? Math.round(newMorale / 10) : -1;
      const newFanCount = Math.max(100, fc.fanCount + fanGrowth);

      // 季票销量（每日小增量）
      const todayTicketsSold = Math.round(fc.fanCount * 0.01 * (newMorale / 100));
      // 商品收入（每日，与胜率挂钩）
      const todayMerchRev = Math.round(
        todayMatches.length > 0
          ? fc.fanCount * 5 * (newMorale / 100)
          : fc.fanCount * 2 * (newMorale / 100),
      );

      await this.prisma.fanCenter.update({
        where: { teamId },
        data: {
          morale: newMorale,
          fanCount: newFanCount,
          seasonTicketsSold: { increment: Math.max(0, todayTicketsSold) },
          merchandiseRevenue: { increment: todayMerchRev },
        },
      });
    }
  }

  // ─── 球迷中心初始化 ───

  /** 为球队创建 FanCenter（如不存在） */
  async initFanCenterForTeam(teamId: string): Promise<number> {
    const existing = await this.prisma.fanCenter.count({ where: { teamId } });
    if (existing > 0) return 0;
    await this.prisma.fanCenter.create({ data: { teamId } });
    return 1;
  }

  /** 启动时为缺球迷中心的球队初始化 */
  async ensureFanCenterForAllTeams(): Promise<number> {
    const teams = await this.prisma.team.findMany({
      where: { id: { not: { startsWith: "DRAFT_POOL_" } } },
      select: { id: true },
    });
    let created = 0;
    for (const t of teams) {
      created += await this.initFanCenterForTeam(t.id);
    }
    return created;
  }

  /** 赛季交接：为新球队初始化球迷中心 */
  async initForNewSeason(): Promise<number> {
    return this.ensureFanCenterForAllTeams();
  }

  // ─── 工具：写入事件（供其他模块调用） ───

  /** 写入球迷事件并更新 morale（交易/签约等） */
  async recordEvent(
    teamId: string,
    seasonId: string,
    day: number,
    type: string,
    note?: string,
  ): Promise<void> {
    const impact = EVENT_IMPACT[type] ?? 0;
    await this.prisma.fanEvent.create({
      data: { teamId, seasonId, day, type, impact, note },
    });
    const fc = await this.prisma.fanCenter.upsert({
      where: { teamId },
      create: { teamId },
      update: {},
    });
    await this.prisma.fanCenter.update({
      where: { teamId },
      data: { morale: clamp(fc.morale + impact) },
    });
  }

  // ─── 视图转换 ───

  private toView(fc: { teamId: string; fanCount: number; morale: number; loyalty: number; seasonTicketsSold: number; merchandiseRevenue: number; updatedAt: Date }): FanCenterView {
    return {
      teamId: fc.teamId,
      fanCount: fc.fanCount,
      morale: fc.morale,
      loyalty: fc.loyalty,
      seasonTicketsSold: fc.seasonTicketsSold,
      merchandiseRevenue: fc.merchandiseRevenue,
      updatedAt: fc.updatedAt.toISOString(),
    };
  }

  private toEventView(r: { id: string; teamId: string; seasonId: string; day: number; type: string; impact: number; note: string | null; createdAt: Date }): FanEventView {
    return {
      id: r.id,
      teamId: r.teamId,
      seasonId: r.seasonId,
      day: r.day,
      type: r.type,
      impact: r.impact,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

// 导出标签常量供 controller 使用
export { EVENT_LABEL, EVENT_IMPACT };
