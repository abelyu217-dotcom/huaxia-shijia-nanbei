/**
 * FacilityService——球馆设施服务（P2-3）
 *
 * 职责：
 * 1. 查询/初始化球队球馆设施（训练馆 + 主场馆）
 * 2. 升级设施等级（消耗 Coins，经 WalletService 扣款）
 * 3. 暴露训练成长倍率与主场馆营收倍率供其它模块调用
 *
 * 等级机制（参考 经济系统设计.html 球馆等级表 + 训练系统设计.html 修正层）：
 *   训练馆 Lv1-Lv5 → 训练成长倍率 1.00 / 1.10 / 1.20 / 1.30 / 1.45
 *   主场馆 Lv1-Lv5 → 比赛日营收倍率 1.00 / 1.15 / 1.30 / 1.50 / 1.75
 *
 * 升级费用：每级 50k / 120k / 250k / 500k Coins（参考 academy）
 *
 * 参见：开发计划.html §P2-3 球馆系统深化
 */

import { Injectable, BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { WalletService } from "../wallet/wallet.service.js";

/** 等级上限 */
export const MAX_FACILITY_LEVEL = 5;

/** 各设施类型 */
export type FacilityType = "trainingHall" | "arena";

/** 升级费用表：index=目标等级（1→2 用 UPGRADE_COST[2]） */
const UPGRADE_COST: Record<FacilityType, number[]> = {
  trainingHall: [0, 0, 50_000, 120_000, 250_000, 500_000],
  arena: [0, 0, 80_000, 180_000, 360_000, 720_000],
};

/** 训练馆等级 → 训练成长倍率 */
const TRAINING_MULTIPLIER = [1.0, 1.0, 1.1, 1.2, 1.3, 1.45];

/** 主场馆等级 → 比赛日营收倍率 */
const ARENA_REVENUE_MULTIPLIER = [1.0, 1.0, 1.15, 1.3, 1.5, 1.75];

/** 主场馆等级 → 主场优势加成（叠加到 sim.homeAdvantage） */
const HOME_ADVANTAGE_BONUS = [0, 0, 0.5, 1.0, 1.5, 2.0];

/** 设施类型标签 */
const FACILITY_LABEL: Record<FacilityType, string> = {
  trainingHall: "训练馆",
  arena: "主场馆",
};

export interface FacilityView {
  teamId: string;
  trainingHallLv: number;
  arenaLv: number;
  trainingMultiplier: number;
  arenaRevenueMultiplier: number;
  homeAdvantageBonus: number;
  upgrades: {
    trainingHall: { cost: number | null; nextMultiplier: number | null };
    arena: { cost: number | null; nextRevenue: number | null; nextHomeBonus: number | null };
  };
}

@Injectable()
export class FacilityService {
  private readonly logger = new Logger(FacilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
  ) {}

  /** 获取球队球馆设施（不存在则自动初始化为 1 级） */
  async getFacility(teamId: string): Promise<FacilityView> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
    if (!team) throw new NotFoundException(`Team ${teamId} not found`);

    let facility = await this.prisma.facility.findUnique({ where: { teamId } });
    if (!facility) {
      facility = await this.prisma.facility.create({
        data: { teamId, trainingHallLv: 1, arenaLv: 1 },
      });
      this.logger.log(`初始化球馆设施：team=${teamId}`);
    }

    return this.toView(facility);
  }

  /** 升级指定设施类型 */
  async upgradeFacility(teamId: string, type: FacilityType, userId?: string): Promise<FacilityView> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, userId: true },
    });
    if (!team) throw new NotFoundException(`Team ${teamId} not found`);

    // 鉴权：仅球队所有者可升级
    if (userId && team.userId && team.userId !== userId) {
      throw new BadRequestException("只能升级自己球队的设施");
    }

    const facility = await this.prisma.facility.findUnique({ where: { teamId } });
    if (!facility) {
      // 自动初始化后再升级
      await this.prisma.facility.create({
        data: { teamId, trainingHallLv: 1, arenaLv: 1 },
      });
      return this.upgradeFacility(teamId, type, userId);
    }

    const currentLv = type === "trainingHall" ? facility.trainingHallLv : facility.arenaLv;
    if (currentLv >= MAX_FACILITY_LEVEL) {
      throw new BadRequestException(`${FACILITY_LABEL[type]}已满级`);
    }

    const nextLv = currentLv + 1;
    const cost = UPGRADE_COST[type][nextLv]!;

    // 扣款：优先通过 WalletService 消费 Coins
    const ownerUserId = userId ?? team.userId;
    if (!ownerUserId) {
      throw new BadRequestException("球队未关联用户，无法扣款");
    }
    try {
      await this.walletService.spendCoins(ownerUserId, cost, `upgrade:${type}:${nextLv}`);
    } catch (e: unknown) {
      // WalletService 抛 Error；转为 BadRequestException 让前端拿到 4xx
      const msg = e instanceof Error ? e.message : "扣款失败";
      throw new BadRequestException(msg);
    }

    const data =
      type === "trainingHall"
        ? { trainingHallLv: { increment: 1 } }
        : { arenaLv: { increment: 1 } };
    const updated = await this.prisma.facility.update({ where: { teamId }, data });
    this.logger.log(`球馆升级：team=${teamId} ${FACILITY_LABEL[type]} Lv${currentLv}→Lv${nextLv} 花费 ${cost} Coins`);

    return this.toView(updated);
  }

  /** 训练成长倍率（供 CareerService 调用） */
  async getTrainingMultiplier(teamId: string): Promise<number> {
    const facility = await this.prisma.facility.findUnique({ where: { teamId } });
    const lv = facility?.trainingHallLv ?? 1;
    return TRAINING_MULTIPLIER[lv] ?? 1.0;
  }

  /** 主场馆等级 → 比赛日营收倍率（供赛季结算/经济系统调用） */
  async getArenaRevenueMultiplier(teamId: string): Promise<number> {
    const facility = await this.prisma.facility.findUnique({ where: { teamId } });
    const lv = facility?.arenaLv ?? 1;
    return ARENA_REVENUE_MULTIPLIER[lv] ?? 1.0;
  }

  /** 主场馆等级 → 主场优势加成（供 sim 引擎调用，叠加到 homeAdvantage） */
  async getHomeAdvantageBonus(teamId: string): Promise<number> {
    const facility = await this.prisma.facility.findUnique({ where: { teamId } });
    const lv = facility?.arenaLv ?? 1;
    return HOME_ADVANTAGE_BONUS[lv] ?? 0;
  }

  private toView(facility: {
    teamId: string;
    trainingHallLv: number;
    arenaLv: number;
  }): FacilityView {
    const tl = facility.trainingHallLv;
    const al = facility.arenaLv;
    return {
      teamId: facility.teamId,
      trainingHallLv: tl,
      arenaLv: al,
      trainingMultiplier: TRAINING_MULTIPLIER[tl] ?? 1.0,
      arenaRevenueMultiplier: ARENA_REVENUE_MULTIPLIER[al] ?? 1.0,
      homeAdvantageBonus: HOME_ADVANTAGE_BONUS[al] ?? 0,
      upgrades: {
        trainingHall: {
          cost: tl < MAX_FACILITY_LEVEL ? UPGRADE_COST.trainingHall[tl + 1]! : null,
          nextMultiplier: tl < MAX_FACILITY_LEVEL ? TRAINING_MULTIPLIER[tl + 1] ?? null : null,
        },
        arena: {
          cost: al < MAX_FACILITY_LEVEL ? UPGRADE_COST.arena[al + 1]! : null,
          nextRevenue: al < MAX_FACILITY_LEVEL ? ARENA_REVENUE_MULTIPLIER[al + 1] ?? null : null,
          nextHomeBonus: al < MAX_FACILITY_LEVEL ? HOME_ADVANTAGE_BONUS[al + 1] ?? null : null,
        },
      },
    };
  }
}
