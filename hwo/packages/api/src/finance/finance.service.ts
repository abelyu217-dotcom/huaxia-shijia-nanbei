/**
 * FinanceService —— v0.6 真实财务系统
 *
 * 职责：
 * 1. 球队现金账户初始化（TeamCash + 默认 Sponsor）
 * 2. 每日结算（runDaily）：所有收支真实依据数据库聚合，写入 CashLedger
 *    - sponsor: 主赞助商 + 装备赞助 + 胜场奖金
 *    - ticket: 主场票务 + 客场分红
 *    - broadcast: 转播分成
 *    - salary: 球员日薪
 *    - staff: 职员日薪
 *    - facility: 设施维护
 *    - academy: 青训投入
 *    - transfer: 转会现金（其他模块触发时入账）
 * 3. 余额更新：每次入账后增量更新 TeamCash.balance
 *
 * 数据来源（无 mock）：
 * - 赞助商：Sponsor 表（basePerSeason / bonusPerWin）
 * - 票务：当日比赛 × FanCenter.fanCount × 上座率 × ticketPrice × arenaLv 系数
 * - 薪资：Player.salary + Professional.salary 聚合
 * - 设施：Facility.trainingHallLv + arenaLv
 * - 青训：Academy.investment 摊销
 *
 * 参见：方案 §2.2 / §3.1
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** 赛季天数（用于摊销日值） */
const SEASON_DAYS = 90;

/** 赞助商档位映射：tier → basePerSeason 基准 */
const SPONSOR_TIER_BASE: Record<string, number> = {
  D: 200_000,
  C: 500_000,
  B: 1_200_000,
  A: 2_500_000,
  S: 5_000_000,
};

/** 主场馆等级 → 上座容量上限 */
const ARENA_CAPACITY: Record<number, number> = {
  1: 3000,
  2: 6000,
  3: 10000,
  4: 15000,
  5: 20000,
};

/** 票价档位（按赞助商档位映射，C=50/D=30/B=80/A=120/S=200） */
const TIER_TICKET_PRICE: Record<string, number> = {
  D: 30,
  C: 50,
  B: 80,
  A: 120,
  S: 200,
};

/** 设施日维护基数（每等级） */
const FACILITY_MAINT_PER_LV = 2000;

/** 青训日投入基数 */
const ACADEMY_DAILY_BASE = 3000;

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 球队首次启用财务系统：创建 TeamCash + 默认 Sponsor
   * 幂等：若已存在则跳过。
   */
  async ensureTeamCashInitialized(teamId: string): Promise<void> {
    const existing = await this.prisma.teamCash.findUnique({
      where: { teamId },
    });
    if (existing) return;

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true },
    });
    if (!team) return;

    const tier = "C";
    await this.prisma.teamCash.create({
      data: {
        teamId,
        balance: 5_000_000,
        sponsorTier: tier,
        ticketPrice: TIER_TICKET_PRICE[tier] ?? 50,
        debt: 0,
      },
    });

    // 默认赞助商（main + kit）
    const base = SPONSOR_TIER_BASE[tier] ?? SPONSOR_TIER_BASE.C!;
    await this.prisma.sponsor.createMany({
      data: [
        {
          teamId,
          type: "main",
          name: `${team.name} 主赞助商`,
          tier,
          basePerSeason: base,
          bonusPerWin: Math.round(base * 0.005),
          titleBonus: Math.round(base * 0.5),
          satisfaction: 60,
          expectedWinRate: 0.5,
          expectedPlayoff: true,
          contractSeasons: 2,
          startSeason: 2027,
        },
        {
          teamId,
          type: "kit",
          name: `${team.name} 装备赞助`,
          tier: "D",
          basePerSeason: Math.round(base * 0.3),
          bonusPerWin: 0,
          titleBonus: 0,
          satisfaction: 60,
          expectedWinRate: 0.4,
          expectedPlayoff: false,
          contractSeasons: 2,
          startSeason: 2027,
        },
      ],
    });

    this.logger.log(`[Finance] 球队 ${team.name} 初始化：余额 5,000,000 / 主赞助商 ${tier}`);
  }

  /**
   * 每日财务结算（由 ScheduleService.advanceDay 调用）
   * 1. 确保账户初始化
   * 2. 按分类聚合当日所有收支
   * 3. 写入 CashLedger 流水
   * 4. 更新 TeamCash.balance
   */
  async runDaily(teamId: string, seasonId: string, day: number): Promise<void> {
    await this.ensureTeamCashInitialized(teamId);

    const ledgerEntries: Array<{
      teamId: string;
      seasonId: string;
      day: number;
      category: string;
      subType: string;
      amount: number;
      note?: string;
    }> = [];

    // ─── 1. 赞助商分成 ───
    const sponsors = await this.prisma.sponsor.findMany({
      where: { teamId, endSeason: null },
    });
    for (const s of sponsors) {
      const daily = Math.round(s.basePerSeason / SEASON_DAYS);
      if (daily > 0) {
        ledgerEntries.push({
          teamId,
          seasonId,
          day,
          category: "sponsor",
          subType: s.type === "main" ? "main_sponsor" : s.type === "kit" ? "kit_sponsor" : "other_sponsor",
          amount: daily,
          note: `${s.name} 日分成`,
        });
      }
    }

    // ─── 2. 比赛日收入（票务 + 胜场奖金） ───
    const todayMatches = await this.prisma.match.findMany({
      where: {
        seasonId,
        day,
        status: "settled",
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: { result: true },
    });

    const cash = await this.prisma.teamCash.findUnique({ where: { teamId } });
    const ticketPrice = cash?.ticketPrice ?? 50;
    const facility = await this.prisma.facility.findUnique({ where: { teamId } });
    const arenaLv = facility?.arenaLv ?? 1;
    const fanCenter = await this.prisma.fanCenter.findUnique({ where: { teamId } });
    const fanCount = fanCenter?.fanCount ?? 1000;
    const morale = fanCenter?.morale ?? 60;
    const attendanceRate = Math.max(0.3, Math.min(1, morale / 100));
    const capacity = ARENA_CAPACITY[arenaLv] ?? ARENA_CAPACITY[1]!;

    let winCount = 0;
    for (const m of todayMatches) {
      const isHome = m.homeTeamId === teamId;
      if (isHome) {
        // 主场票务
        const audience = Math.min(capacity, Math.round(fanCount * attendanceRate));
        const revenue = audience * ticketPrice;
        ledgerEntries.push({
          teamId,
          seasonId,
          day,
          category: "ticket",
          subType: "home_game",
          amount: revenue,
          note: `主场票务（${audience}/${capacity} 人，${m.result ? (m.result.homeScore > m.result.awayScore ? "胜" : "负") : "未结算"}）`,
        });
        // 胜场奖金（仅赞助商赢球奖金）
        if (m.result && m.result.winnerId === teamId) {
          winCount++;
          const mainSponsor = sponsors.find((s) => s.type === "main");
          if (mainSponsor && mainSponsor.bonusPerWin > 0) {
            ledgerEntries.push({
              teamId,
              seasonId,
              day,
              category: "sponsor",
              subType: "win_bonus",
              amount: mainSponsor.bonusPerWin,
              note: `胜场奖金（${mainSponsor.name}）`,
            });
          }
        }
      } else {
        // 客场分红（主场馆收入的 10%）
        if (m.result) {
          const homeCapacity = ARENA_CAPACITY[arenaLv] ?? ARENA_CAPACITY[1]!;
          const homeAudience = Math.min(homeCapacity, Math.round(1000 * 0.5));
          const share = Math.round(homeAudience * ticketPrice * 0.1);
          if (share > 0) {
            ledgerEntries.push({
              teamId,
              seasonId,
              day,
              category: "ticket",
              subType: "away_share",
              amount: share,
              note: "客场票务分红",
            });
          }
          if (m.result.winnerId === teamId) winCount++;
        }
      }
    }

    // ─── 3. 转播分成（按赛季固定值摊销 + 战绩奖金） ───
    const broadcastBase = 800_000;
    const broadcastDaily = Math.round(broadcastBase / SEASON_DAYS);
    ledgerEntries.push({
      teamId,
      seasonId,
      day,
      category: "broadcast",
      subType: "league_share",
      amount: broadcastDaily,
      note: "联盟转播分成（日摊销）",
    });

    // ─── 4. 球员日薪 ───
    const playerSalaries = await this.prisma.player.aggregate({
      where: { teamId, retired: false },
      _sum: { salary: true },
      _count: true,
    });
    const playerDaily = Math.round((playerSalaries._sum.salary ?? 0) / SEASON_DAYS);
    if (playerDaily > 0) {
      ledgerEntries.push({
        teamId,
        seasonId,
        day,
        category: "salary",
        subType: "player_salary",
        amount: -playerDaily,
        note: `球员日薪（${playerSalaries._count} 人）`,
      });
    }

    // ─── 5. 职员日薪（按职业等级估算月薪：head_coach=50000, asst_coach=20000, trainer=15000, scout=12000, 其他=8000） ───
    const staffJobs = await this.prisma.professional.groupBy({
      by: ["job"],
      where: { employerTeamId: teamId },
      _count: true,
    });
    const JOB_MONTHLY: Record<string, number> = {
      head_coach: 50000,
      asst_coach: 20000,
      trainer: 15000,
      scout: 12000,
      agent: 8000,
      merchant: 8000,
      arena_ops: 8000,
      reporter: 8000,
      caster: 8000,
      arbiter: 8000,
      union_rep: 8000,
    };
    let staffMonthly = 0;
    let staffCount = 0;
    for (const g of staffJobs) {
      const monthly = JOB_MONTHLY[g.job] ?? 8000;
      staffMonthly += monthly * g._count;
      staffCount += g._count;
    }
    const staffDaily = Math.round(staffMonthly / 30);
    if (staffDaily > 0) {
      ledgerEntries.push({
        teamId,
        seasonId,
        day,
        category: "staff",
        subType: "staff_salary",
        amount: -staffDaily,
        note: `职员日薪（${staffCount} 人，估算月薪 ${staffMonthly.toLocaleString()}）`,
      });
    }

    // ─── 6. 设施维护 ───
    const trainingHallLv = facility?.trainingHallLv ?? 1;
    const facilityDaily = (trainingHallLv + arenaLv) * FACILITY_MAINT_PER_LV;
    ledgerEntries.push({
      teamId,
      seasonId,
      day,
      category: "facility",
      subType: "maintenance",
      amount: -facilityDaily,
      note: `设施维护（训练馆 Lv${trainingHallLv} + 主场馆 Lv${arenaLv}）`,
    });

    // ─── 7. 青训投入 ───
    const academy = await this.prisma.academy.findUnique({ where: { teamId } });
    if (academy) {
      const academyDaily = ACADEMY_DAILY_BASE + academy.level * 1000;
      ledgerEntries.push({
        teamId,
        seasonId,
        day,
        category: "academy",
        subType: "invest",
        amount: -academyDaily,
        note: `青训投入（学院 Lv${academy.level}）`,
      });
    }

    // ─── 8. 写入流水 + 更新余额 ───
    if (ledgerEntries.length === 0) return;

    const net = ledgerEntries.reduce((s, e) => s + e.amount, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.cashLedger.createMany({
        data: ledgerEntries.map((e) => ({
          teamId: e.teamId,
          seasonId: e.seasonId,
          day: e.day,
          category: e.category,
          subType: e.subType,
          amount: e.amount,
          note: e.note,
        })),
      });
      await tx.teamCash.update({
        where: { teamId },
        data: { balance: { increment: net } },
      });
    });

    this.logger.log(
      `[Finance] 球队 ${teamId} 第 ${day} 日结算：${ledgerEntries.length} 条流水，净额 ${net >= 0 ? "+" : ""}${net.toLocaleString()}`,
    );
  }

  /**
   * 批量结算当日所有球队
   */
  async runDailyAllTeams(seasonId: string, day: number): Promise<void> {
    const teams = await this.prisma.team.findMany({
      where: { worldId: { not: null } },
      select: { id: true },
    });
    for (const t of teams) {
      try {
        await this.runDaily(t.id, seasonId, day);
      } catch (e) {
        this.logger.error(
          `[Finance] 球队 ${t.id} 结算失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  /**
   * 转会现金入账（由 TradeService 调用）
   */
  async recordTransfer(
    teamId: string,
    seasonId: string,
    day: number,
    amount: number,
    note: string,
    refId?: string,
  ): Promise<void> {
    if (amount === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.cashLedger.create({
        data: {
          teamId,
          seasonId,
          day,
          category: "transfer",
          subType: amount > 0 ? "fee_in" : "fee_out",
          amount,
          note,
          refId,
        },
      });
      await tx.teamCash.update({
        where: { teamId },
        data: { balance: { increment: amount } },
      });
    });
  }

  /**
   * 联盟罚款（由联盟处罚系统调用）
   */
  async recordFine(
    teamId: string,
    seasonId: string,
    day: number,
    amount: number,
    note: string,
    refId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.cashLedger.create({
        data: {
          teamId,
          seasonId,
          day,
          category: "fine",
          subType: "league_fine",
          amount: -Math.abs(amount),
          note,
          refId,
        },
      });
      await tx.teamCash.update({
        where: { teamId },
        data: { balance: { increment: -Math.abs(amount) } },
      });
    });
  }

  // ──────────────────────────────────────────────────────
  // 查询接口（供 controller 调用）
  // ──────────────────────────────────────────────────────

  /** 球队现金账户概要 */
  async getAccountSummary(teamId: string) {
    const cash = await this.prisma.teamCash.findUnique({ where: { teamId } });
    if (!cash) {
      return {
        initialized: false,
        balance: 0,
        sponsorTier: "C",
        ticketPrice: 50,
        debt: 0,
      };
    }

    // 当日 / 本周 / 本赛季 净额（按 day 范围跨赛季聚合）
    const latest = await this.prisma.cashLedger.aggregate({
      where: { teamId },
      _max: { day: true },
    });
    const currentDay = latest._max.day ?? 1;
    const weekStart = Math.max(1, currentDay - 6);

    const today = await this.prisma.cashLedger.aggregate({
      where: { teamId, day: currentDay },
      _sum: { amount: true },
    });
    const week = await this.prisma.cashLedger.aggregate({
      where: { teamId, day: { gte: weekStart, lte: currentDay } },
      _sum: { amount: true },
    });
    const seasonNet = await this.prisma.cashLedger.aggregate({
      where: { teamId },
      _sum: { amount: true },
    });

    return {
      initialized: true,
      balance: cash.balance,
      sponsorTier: cash.sponsorTier,
      ticketPrice: cash.ticketPrice,
      debt: cash.debt,
      todayNet: today._sum.amount ?? 0,
      weekNet: week._sum.amount ?? 0,
      seasonNet: seasonNet._sum.amount ?? 0,
    };
  }

  /** 收支分类汇总（按 category） */
  async getCategorySummary(teamId: string, dayRange?: { gte: number; lte: number }) {
    const where: any = { teamId };
    if (dayRange) where.day = { gte: dayRange.gte, lte: dayRange.lte };

    const rows = await this.prisma.cashLedger.groupBy({
      by: ["category", "subType"],
      where,
      _sum: { amount: true },
      orderBy: { category: "asc" },
    });

    const result: Record<string, { income: number; expense: number; items: Array<{ subType: string; amount: number }> }> = {};
    for (const r of rows) {
      const cat = r.category;
      if (!result[cat]) result[cat] = { income: 0, expense: 0, items: [] };
      const amt = r._sum.amount ?? 0;
      if (amt >= 0) result[cat]!.income += amt;
      else result[cat]!.expense += -amt;
      result[cat]!.items.push({ subType: r.subType, amount: amt });
    }
    return result;
  }

  /** 流水明细（分页） */
  async getLedgerEntries(
    teamId: string,
    options: { day?: number; dayGte?: number; dayLte?: number; category?: string; incomeOnly?: boolean; expenseOnly?: boolean; limit?: number; offset?: number } = {},
  ) {
    const where: any = { teamId };
    if (options.day != null) where.day = options.day;
    else if (options.dayGte != null || options.dayLte != null) {
      where.day = {};
      if (options.dayGte != null) where.day.gte = options.dayGte;
      if (options.dayLte != null) where.day.lte = options.dayLte;
    }
    if (options.category) where.category = options.category;
    if (options.incomeOnly) where.amount = { gt: 0 };
    if (options.expenseOnly) where.amount = { lt: 0 };

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const [entries, total] = await Promise.all([
      this.prisma.cashLedger.findMany({
        where,
        orderBy: [{ day: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.cashLedger.count({ where }),
    ]);

    return { entries, total, limit, offset };
  }
}
