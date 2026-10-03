/**
 * MarketService——人才市场服务
 *
 * v0.6 §批次6 设计：
 * - TransferMarketPhase 阶段管理（closed / free_agency / restricted）
 *   - 自由市场期间签约立即入队
 *   - 受限市场期间签约加入"待加入列表"，赛季最后一日统一入队
 * - 球员 + 各类职员（主教练/助教/训练师/球探/经纪人/商人/记者/解说/裁判/工会代表）自由市场
 * - 阶段切换由 schedule.service 每日检查触发
 *
 * 参见：HW0_系统调整方案_v2.md §6.5
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

// ── 视图类型 ──

export interface TransferMarketPhaseView {
  seasonId: string;
  phase: "closed" | "free_agency" | "restricted";
  freeAgencyEndDay: number | null;
  restrictedStartDay: number | null;
  restrictedEndDay: number | null;
  updatedAt: string;
}

export interface FreeAgentPlayerView {
  id: string;
  name: string;
  position: string;
  age: number;
  ovr: number;
  askingSalary: number;
  status: "free" | "restricted" | "claimed";
  // 球探报告摘要（若已探查）
  scouted: boolean;
}

export interface FreeAgentStaffView {
  id: string;
  name: string;
  job: string;
  jobLabel: string;
  level: number;
  proReputation: number;
  signOnCost: number;
  salaryPerDay: number;
  trainingBonus: number;
  scoutBonus: number;
  status: "free" | "restricted" | "claimed";
}

export interface MarketOverviewView {
  phase: TransferMarketPhaseView;
  freeAgentPlayers: FreeAgentPlayerView[];
  freeAgentStaff: FreeAgentStaffView[];
  pendingSignings: PendingSigningView[];
}

export interface PendingSigningView {
  id: string;
  teamId: string;
  teamName: string;
  targetType: string; // player | head_coach | ...
  targetRef: string;
  targetName: string;
  cost: number;
  day: number;
  status: "pending" | "joined" | "cancelled";
  createdAt: string;
}

// ── 阶段标签 ──

const PHASE_LABEL: Record<string, string> = {
  closed: "关闭",
  free_agency: "自由市场",
  restricted: "受限市场",
};

const STAFF_JOB_LABEL: Record<string, string> = {
  head_coach: "主教练",
  asst_coach: "助理教练",
  trainer: "训练师",
  scout: "球探",
  agent: "经纪人",
  merchant: "商人",
  reporter: "记者",
  caster: "解说",
  arbiter: "裁判",
  union_rep: "工会代表",
};

const JOB_KEYS = Object.keys(STAFF_JOB_LABEL);

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── 阶段管理 ───

  /** 获取赛季的市场阶段 */
  async getPhase(seasonId: string): Promise<TransferMarketPhaseView> {
    const phase = await this.prisma.transferMarketPhase.upsert({
      where: { seasonId },
      create: {
        seasonId,
        phase: "free_agency",
        freeAgencyEndDay: 30,
        restrictedStartDay: 31,
        restrictedEndDay: 60,
      },
      update: {},
    });
    return this.toPhaseView(phase);
  }

  /**
   * 每日检查并切换阶段（由 schedule.service 调用）
   * - day >= freeAgencyEndDay+1 且 day < restrictedStartDay → restricted
   * - day >= restrictedEndDay → 触发"统一入队" + 关闭市场
   */
  async checkPhaseSwitch(seasonId: string, day: number): Promise<TransferMarketPhaseView | null> {
    const phase = await this.prisma.transferMarketPhase.findUnique({ where: { seasonId } });
    if (!phase) {
      // 首次访问，创建默认配置
      return this.getPhase(seasonId);
    }

    let newPhase: "closed" | "free_agency" | "restricted" = phase.phase as "closed" | "free_agency" | "restricted";

    // 自由市场 → 受限市场
    if (phase.phase === "free_agency" && phase.freeAgencyEndDay && day > phase.freeAgencyEndDay) {
      newPhase = "restricted";
    }
    // 受限市场 → 关闭（统一入队）
    if (phase.phase === "restricted" && phase.restrictedEndDay && day >= phase.restrictedEndDay) {
      newPhase = "closed";
      // 触发统一入队
      try {
        const joined = await this.processPendingSignings(seasonId, day);
        this.logger.log(`[Market] 受限市场结束：${joined} 笔签约统一入队`);
      } catch (e) {
        this.logger.warn(
          `[Market] 统一入队失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    if (newPhase !== phase.phase) {
      const updated = await this.prisma.transferMarketPhase.update({
        where: { seasonId },
        data: { phase: newPhase },
      });
      this.logger.log(`[Market] 阶段切换：${phase.phase} → ${newPhase}（第 ${day} 日）`);
      return this.toPhaseView(updated);
    }
    return this.toPhaseView(phase);
  }

  /** 赛季初始化：创建市场阶段记录 */
  async initForNewSeason(seasonId: string): Promise<void> {
    await this.prisma.transferMarketPhase.upsert({
      where: { seasonId },
      create: {
        seasonId,
        phase: "free_agency",
        freeAgencyEndDay: 30,
        restrictedStartDay: 31,
        restrictedEndDay: 60,
      },
      update: {
        phase: "free_agency",
      },
    });
    this.logger.log(`[Market] 新赛季市场阶段已初始化：free_agency`);
  }

  // ─── 球员自由市场 ───

  /** 列出自由球员（无球队的未退役球员） */
  async listFreeAgentPlayers(teamId: string): Promise<FreeAgentPlayerView[]> {
    const players = await this.prisma.player.findMany({
      where: {
        teamId: null,
        retired: false,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, position: true, age: true, abilities: true, salary: true },
    });

    // 检查每名球员是否已被本队"预定"（pending signing）
    const pending = await this.prisma.pendingSigning.findMany({
      where: { teamId, targetType: "player", status: "pending" },
      select: { targetRef: true },
    });
    const pendingIds = new Set(pending.map((p) => p.targetRef));

    return players.map((p) => {
      const ab = p.abilities as Record<string, number> | null;
      const ovr = ab ? Math.round(Object.values(ab).reduce((s, v) => s + v, 0) / Object.values(ab).length) : 60;
      return {
        id: p.id,
        name: p.name,
        position: p.position,
        age: p.age,
        ovr,
        askingSalary: p.salary ?? 500_000,
        status: (pendingIds.has(p.id) ? "claimed" : "free") as "free" | "claimed",
        scouted: false, // 简化：球探状态由前端从 scout 模块查询
      };
    });
  }

  /** 签约自由球员 */
  async signFreeAgentPlayer(teamId: string, playerId: string, seasonId: string, day: number): Promise<{ status: "joined" | "pending" }> {
    const phase = await this.getPhase(seasonId);
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException("球员不存在");
    if (player.teamId) throw new BadRequestException("球员已被其他球队签约");

    // 检查现金
    const cash = await this.prisma.teamCash.findUnique({ where: { teamId } });
    const cost = player.salary ?? 500_000;
    if (!cash || cash.balance < cost) {
      throw new BadRequestException(`现金不足：需要 ${cost.toLocaleString()} 元`);
    }

    if (phase.phase === "free_agency") {
      // 立即入队
      await this.prisma.$transaction(async (tx) => {
        await tx.teamCash.update({
          where: { teamId },
          data: { balance: { decrement: cost } },
        });
        await tx.player.update({
          where: { id: playerId },
          data: { teamId },
        });
        await tx.cashLedger.create({
          data: {
            teamId,
            seasonId,
            day,
            category: "transfer",
            subType: "free_agent_sign",
            amount: -cost,
            refId: playerId,
            note: `自由市场签约 ${player.name}`,
          },
        });
      });
      this.logger.log(`[Market] 球队 ${teamId} 自由市场签约球员 ${player.name}（立即入队）`);
      return { status: "joined" };
    } else if (phase.phase === "restricted") {
      // 加入待加入列表
      await this.prisma.$transaction(async (tx) => {
        await tx.teamCash.update({
          where: { teamId },
          data: { balance: { decrement: cost } },
        });
        await tx.pendingSigning.create({
          data: {
            teamId,
            seasonId,
            day,
            targetType: "player",
            targetRef: playerId,
            targetName: player.name,
            cost,
            status: "pending",
          },
        });
        await tx.cashLedger.create({
          data: {
            teamId,
            seasonId,
            day,
            category: "transfer",
            subType: "restricted_sign",
            amount: -cost,
            refId: playerId,
            note: `受限市场签约 ${player.name}（赛季末入队）`,
          },
        });
      });
      this.logger.log(`[Market] 球队 ${teamId} 受限市场签约球员 ${player.name}（赛季末入队）`);
      return { status: "pending" };
    }
    throw new BadRequestException("市场已关闭，无法签约");
  }

  // ─── 职员自由市场 ───

  /** 列出自由职员（未被雇佣的 NPC 职员） */
  async listFreeAgentStaff(teamId: string): Promise<FreeAgentStaffView[]> {
    const pros = await this.prisma.professional.findMany({
      where: {
        employmentStatus: { in: ["preset_npc", "unemployed"] },
      },
      include: { user: { select: { nickname: true } } },
      take: 50,
      orderBy: { level: "desc" },
    });

    const pending = await this.prisma.pendingSigning.findMany({
      where: { teamId, targetType: { in: JOB_KEYS }, status: "pending" },
      select: { targetRef: true },
    });
    const pendingIds = new Set(pending.map((p) => p.targetRef));

    return pros.map((p) => {
      const job = (p.job as string) ?? "scout";
      const level = p.level;
      const signOnCost = 100_000 + level * 30_000;
      const salaryPerDay = 1_000 + level * 200;
      const trainingBonus = job === "trainer" ? level * 0.02 : 0;
      const scoutBonus = job === "scout" ? level * 0.02 : 0;
      return {
        id: p.id,
        name: p.user?.nickname ?? p.userId,
        job,
        jobLabel: STAFF_JOB_LABEL[job] ?? job,
        level,
        proReputation: p.proReputation,
        signOnCost,
        salaryPerDay,
        trainingBonus,
        scoutBonus,
        status: (pendingIds.has(p.id) ? "claimed" : "free") as "free" | "claimed",
      };
    });
  }

  /** 签约自由职员 */
  async signFreeAgentStaff(teamId: string, professionalId: string, seasonId: string, day: number): Promise<{ status: "joined" | "pending" }> {
    const phase = await this.getPhase(seasonId);
    const pro = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      include: { user: { select: { nickname: true } } },
    });
    if (!pro) throw new NotFoundException("职员不存在");
    if (pro.employmentStatus !== "preset_npc" && pro.employmentStatus !== "unemployed") {
      throw new BadRequestException("职员已被雇佣");
    }

    const proName = pro.user?.nickname ?? pro.userId;
    const job = (pro.job as string) ?? "scout";
    const signOnCost = 100_000 + pro.level * 30_000;
    const cash = await this.prisma.teamCash.findUnique({ where: { teamId } });
    if (!cash || cash.balance < signOnCost) {
      throw new BadRequestException(`现金不足：签约费 ${signOnCost.toLocaleString()} 元`);
    }

    if (phase.phase === "free_agency") {
      await this.prisma.$transaction(async (tx) => {
        await tx.teamCash.update({
          where: { teamId },
          data: { balance: { decrement: signOnCost } },
        });
        await tx.professional.update({
          where: { id: professionalId },
          data: {
            employmentStatus: "hired_by_manager",
            employerTeamId: teamId,
          },
        });
        await tx.cashLedger.create({
          data: {
            teamId,
            seasonId,
            day,
            category: "staff",
            subType: `${job}_signon_free`,
            amount: -signOnCost,
            refId: professionalId,
            note: `自由市场签约 ${proName}（${STAFF_JOB_LABEL[job] ?? job}）`,
          },
        });
      });
      this.logger.log(`[Market] 球队 ${teamId} 自由市场签约职员 ${proName}（立即入队）`);
      return { status: "joined" };
    } else if (phase.phase === "restricted") {
      await this.prisma.$transaction(async (tx) => {
        await tx.teamCash.update({
          where: { teamId },
          data: { balance: { decrement: signOnCost } },
        });
        await tx.pendingSigning.create({
          data: {
            teamId,
            seasonId,
            day,
            targetType: job,
            targetRef: professionalId,
            targetName: proName,
            cost: signOnCost,
            status: "pending",
          },
        });
        await tx.cashLedger.create({
          data: {
            teamId,
            seasonId,
            day,
            category: "staff",
            subType: `${job}_signon_restricted`,
            amount: -signOnCost,
            refId: professionalId,
            note: `受限市场签约 ${proName}（赛季末入队）`,
          },
        });
      });
      this.logger.log(`[Market] 球队 ${teamId} 受限市场签约职员 ${proName}（赛季末入队）`);
      return { status: "pending" };
    }
    throw new BadRequestException("市场已关闭，无法签约");
  }

  /** 撤回待加入签约 */
  async cancelPendingSigning(pendingId: string, teamId: string): Promise<void> {
    const pending = await this.prisma.pendingSigning.findUnique({ where: { id: pendingId } });
    if (!pending) throw new NotFoundException("签约记录不存在");
    if (pending.teamId !== teamId) throw new BadRequestException("无权操作其他球队的签约");
    if (pending.status !== "pending") throw new BadRequestException("该签约已处理");

    await this.prisma.$transaction(async (tx) => {
      await tx.teamCash.update({
        where: { teamId },
        data: { balance: { increment: pending.cost } },
      });
      await tx.pendingSigning.update({
        where: { id: pendingId },
        data: { status: "cancelled" },
      });
      await tx.cashLedger.create({
        data: {
          teamId,
          seasonId: pending.seasonId,
          day: pending.day,
          category: "transfer",
          subType: "cancel_signing",
          amount: pending.cost,
          refId: pending.targetRef,
          note: `撤回签约 ${pending.targetName}（退费）`,
        },
      });
    });
  }

  /** 列出本队待加入签约 */
  async listPendingSignings(teamId: string): Promise<PendingSigningView[]> {
    const rows = await this.prisma.pendingSigning.findMany({
      where: { teamId, status: "pending" },
      orderBy: { day: "desc" },
    });
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true },
    });
    return rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      teamName: team?.name ?? "",
      targetType: r.targetType,
      targetRef: r.targetRef,
      targetName: r.targetName,
      cost: r.cost,
      day: r.day,
      status: r.status as "pending" | "joined" | "cancelled",
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ─── 市场总览 ───

  async getOverview(teamId: string, seasonId: string): Promise<MarketOverviewView> {
    const [phase, freeAgentPlayers, freeAgentStaff, pendingSignings] = await Promise.all([
      this.getPhase(seasonId),
      this.listFreeAgentPlayers(teamId),
      this.listFreeAgentStaff(teamId),
      this.listPendingSignings(teamId),
    ]);
    return { phase, freeAgentPlayers, freeAgentStaff, pendingSignings };
  }

  // ─── 受限市场结束：统一入队 ───

  /** 处理所有 pending 签约，统一入队 */
  async processPendingSignings(seasonId: string, day: number): Promise<number> {
    const pendings = await this.prisma.pendingSigning.findMany({
      where: { status: "pending", seasonId },
    });

    let joined = 0;
    for (const p of pendings) {
      try {
        if (p.targetType === "player") {
          await this.prisma.player.update({
            where: { id: p.targetRef },
            data: { teamId: p.teamId },
          });
        } else {
          // 职员
          await this.prisma.professional.update({
            where: { id: p.targetRef },
            data: {
              employmentStatus: "hired_by_manager",
              employerTeamId: p.teamId,
            },
          });
        }
        await this.prisma.pendingSigning.update({
          where: { id: p.id },
          data: { status: "joined" },
        });
        joined++;
        this.logger.log(
          `[Market] 签约 ${p.id}（${p.targetName}）于第 ${day} 日统一入队`,
        );
      } catch (e) {
        this.logger.warn(
          `[Market] 签约 ${p.id} 入队失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return joined;
  }

  // ─── 视图转换 ───

  private toPhaseView(p: { seasonId: string; phase: string; freeAgencyEndDay: number | null; restrictedStartDay: number | null; restrictedEndDay: number | null; updatedAt: Date }): TransferMarketPhaseView {
    return {
      seasonId: p.seasonId,
      phase: p.phase as "closed" | "free_agency" | "restricted",
      freeAgencyEndDay: p.freeAgencyEndDay,
      restrictedStartDay: p.restrictedStartDay,
      restrictedEndDay: p.restrictedEndDay,
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}

export { PHASE_LABEL, STAFF_JOB_LABEL, JOB_KEYS };
