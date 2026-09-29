/**
 * TradeService——跨经理交易系统
 *
 * M2：支持球队间球员 + 现金交易。
 *
 * 核心规则：
 * - 薪资匹配：|报价方送出薪资 - 接收方送出薪资| ≤ max(报价方薪资, 接收方薪资) × 25%
 * - 状态机：pending → accepted | rejected | countered | expired
 * - 最多 3 轮还价
 * - 报价 24 小时后自动过期
 *
 * AI 决策：基于球员 OVR 差距 + 薪资公平性决定接受/拒绝/还价。
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { overallRating, type Abilities } from "@hwo/shared";

const SALARY_MATCH_TOLERANCE = 0.25; // 25% 薪资匹配容差
const MAX_COUNTER_ROUNDS = 3;
const OFFER_EXPIRY_HOURS = 24;

interface CreateOfferDto {
  worldId?: string;
  offerorTeamId: string;
  offereeTeamId: string;
  offerorPlayers: string[];
  offereePlayers: string[];
  offerorCash?: number;
  offereeCash?: number;
}

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建交易报价
   */
  async createOffer(dto: CreateOfferDto) {
    // 验证世界存在（若指定）
    if (dto.worldId) {
      const world = await this.prisma.world.findUnique({ where: { id: dto.worldId } });
      if (!world) throw new NotFoundException(`World ${dto.worldId} not found`);
    }

    // 验证两支球队存在（若指定世界则需在同一世界）
    const [offeror, offeree] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: dto.offerorTeamId } }),
      this.prisma.team.findUnique({ where: { id: dto.offereeTeamId } }),
    ]);
    if (!offeror) throw new NotFoundException(`Team ${dto.offerorTeamId} not found`);
    if (!offeree) throw new NotFoundException(`Team ${dto.offereeTeamId} not found`);
    if (dto.offerorTeamId === dto.offereeTeamId) {
      throw new BadRequestException("不能与自己交易");
    }

    // 验证球员归属
    await this.validatePlayerOwnership(dto.offerorTeamId, dto.offerorPlayers);
    await this.validatePlayerOwnership(dto.offereeTeamId, dto.offereePlayers);

    if (dto.offerorPlayers.length === 0 && dto.offereePlayers.length === 0) {
      throw new BadRequestException("交易至少包含一名球员");
    }

    // 薪资匹配检查
    const { offerorSalary, offereeSalary, match } = await this.checkSalaryMatch({
      offerorPlayers: dto.offerorPlayers,
      offereePlayers: dto.offereePlayers,
      offerorCash: dto.offerorCash ?? 0,
      offereeCash: dto.offereeCash ?? 0,
    });
    if (!match) {
      throw new BadRequestException(
        `薪资不匹配：报价方送出 ${offerorSalary} 万，接收方送出 ${offereeSalary} 万，差距超过 25%`,
      );
    }

    // 创建报价
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + OFFER_EXPIRY_HOURS);

    const offer = await this.prisma.tradeOffer.create({
      data: {
        worldId: dto.worldId,
        offerorTeamId: dto.offerorTeamId,
        offereeTeamId: dto.offereeTeamId,
        offerorPlayers: dto.offerorPlayers,
        offereePlayers: dto.offereePlayers,
        offerorCash: dto.offerorCash ?? 0,
        offereeCash: dto.offereeCash ?? 0,
        status: "pending",
        round: 1,
        expiresAt,
      },
    });

    this.logger.log(
      `报价创建：${dto.offerorTeamId} → ${dto.offereeTeamId} (球员 ${dto.offerorPlayers.length}/${dto.offereePlayers.length})`,
    );
    return offer;
  }

  /**
   * 接受报价——执行球员交换
   */
  async acceptOffer(offerId: string) {
    const offer = await this.prisma.tradeOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
    if (offer.status !== "pending") {
      throw new BadRequestException(`报价状态为 ${offer.status}，无法接受`);
    }
    if (new Date() > offer.expiresAt) {
      await this.prisma.tradeOffer.update({
        where: { id: offerId },
        data: { status: "expired" },
      });
      throw new BadRequestException("报价已过期");
    }

    // 执行球员交换（事务）
    const offerorPlayers = offer.offerorPlayers as string[];
    const offereePlayers = offer.offereePlayers as string[];

    await this.prisma.$transaction(async (tx) => {
      // 报价方球员 → 接收方
      if (offerorPlayers.length > 0) {
        await tx.player.updateMany({
          where: { id: { in: offerorPlayers } },
          data: { teamId: offer.offereeTeamId },
        });
      }
      // 接收方球员 → 报价方
      if (offereePlayers.length > 0) {
        await tx.player.updateMany({
          where: { id: { in: offereePlayers } },
          data: { teamId: offer.offerorTeamId },
        });
      }

      // 更新报价状态
      await tx.tradeOffer.update({
        where: { id: offerId },
        data: { status: "accepted" },
      });
    });

    this.logger.log(`交易完成：${offer.offerorTeamId} ↔ ${offer.offereeTeamId}`);
    return { success: true, offerId };
  }

  /**
   * 拒绝报价
   */
  async rejectOffer(offerId: string) {
    const offer = await this.prisma.tradeOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
    if (offer.status !== "pending") {
      throw new BadRequestException(`报价状态为 ${offer.status}，无法拒绝`);
    }

    await this.prisma.tradeOffer.update({
      where: { id: offerId },
      data: { status: "rejected" },
    });
    return { success: true, offerId, status: "rejected" };
  }

  /**
   * 还价：用新筹码替换原报价
   */
  async counterOffer(
    offerId: string,
    dto: {
      offerorPlayers: string[];
      offereePlayers: string[];
      offerorCash?: number;
      offereeCash?: number;
    },
  ) {
    const offer = await this.prisma.tradeOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
    if (offer.status !== "pending") {
      throw new BadRequestException(`报价状态为 ${offer.status}，无法还价`);
    }
    if (offer.round >= MAX_COUNTER_ROUNDS) {
      throw new BadRequestException(`已达最大还价轮次 (${MAX_COUNTER_ROUNDS})`);
    }

    // 还价时双方角色互换：原接收方变为新报价方
    const newOfferorTeamId = offer.offereeTeamId;
    const newOffereeTeamId = offer.offerorTeamId;

    // 验证球员归属（注意角色互换）
    await this.validatePlayerOwnership(newOfferorTeamId, dto.offerorPlayers);
    await this.validatePlayerOwnership(newOffereeTeamId, dto.offereePlayers);

    // 薪资匹配检查
    const salaryCheck = await this.checkSalaryMatch({
      offerorPlayers: dto.offerorPlayers,
      offereePlayers: dto.offereePlayers,
      offerorCash: dto.offerorCash ?? 0,
      offereeCash: dto.offereeCash ?? 0,
    });
    if (!salaryCheck.match) {
      throw new BadRequestException("薪资不匹配");
    }

    // 更新报价：交换双方、更新筹码、轮次 +1
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + OFFER_EXPIRY_HOURS);

    const updated = await this.prisma.tradeOffer.update({
      where: { id: offerId },
      data: {
        offerorTeamId: newOfferorTeamId,
        offereeTeamId: newOffereeTeamId,
        offerorPlayers: dto.offerorPlayers,
        offereePlayers: dto.offereePlayers,
        offerorCash: dto.offerorCash ?? 0,
        offereeCash: dto.offereeCash ?? 0,
        round: offer.round + 1,
        expiresAt,
        status: "pending",
      },
    });

    this.logger.log(`还价：第 ${updated.round} 轮，${newOfferorTeamId} → ${newOffereeTeamId}`);
    return updated;
  }

  /**
   * AI 决策：根据报价合理性决定接受/拒绝/还价
   */
  async aiDecide(offerId: string): Promise<{ action: "accept" | "reject" | "counter"; reason: string }> {
    const offer = await this.prisma.tradeOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);

    // 获取双方球员
    const [offerorPlayers, offereePlayers] = await Promise.all([
      this.prisma.player.findMany({ where: { id: { in: offer.offerorPlayers as string[] } } }),
      this.prisma.player.findMany({ where: { id: { in: offer.offereePlayers as string[] } } }),
    ]);

    // 计算双方送出的球员总 OVR
    const offerorOVR = this.sumPlayerOVR(
      offerorPlayers.map((p) => p.abilities as unknown as Abilities),
    );
    const offereeOVR = this.sumPlayerOVR(
      offereePlayers.map((p) => p.abilities as unknown as Abilities),
    );

    // 现金补偿考虑
    const cashDiff = (offer.offereeCash ?? 0) - (offer.offerorCash ?? 0);
    const cashAdjustment = cashDiff / 500; // 每 500 万现金 ≈ 1 OVR 点

    const netValue = offerorOVR - offereeOVR + cashAdjustment;

    this.logger.log(
      `AI 决策：报价方 OVR=${offerorOVR}，接收方 OVR=${offereeOVR}，现金差=${cashDiff}，净值=${netValue.toFixed(1)}`,
    );

    // 决策逻辑
    if (netValue > 3) {
      // 报价方送出明显更多 → 接收方大赚 → 接受
      return { action: "accept", reason: "报价优厚，欣然接受" };
    } else if (netValue > 0) {
      // 略微有利 → 接受
      return { action: "accept", reason: "报价合理，接受交易" };
    } else if (netValue > -2) {
      // 略亏但可接受 → 接受
      return { action: "accept", reason: "勉强可接受" };
    } else if (netValue > -5) {
      // 较亏 → 还价
      return { action: "counter", reason: "报价偏低，提出还价" };
    } else {
      // 大亏 → 拒绝
      return { action: "reject", reason: "报价差距过大，拒绝交易" };
    }
  }

  /** 获取球队收到的所有报价 */
  async getReceivedOffers(teamId: string) {
    return this.prisma.tradeOffer.findMany({
      where: { offereeTeamId: teamId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  }

  /** 获取球队发出的所有报价 */
  async getSentOffers(teamId: string) {
    return this.prisma.tradeOffer.findMany({
      where: { offerorTeamId: teamId },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── 内部方法 ──

  private async validatePlayerOwnership(teamId: string, playerIds: string[]): Promise<void> {
    if (playerIds.length === 0) return;
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, teamId: true },
    });
    for (const p of players) {
      if (p.teamId !== teamId) {
        throw new BadRequestException(`球员 ${p.id} 不属于球队 ${teamId}`);
      }
    }
    if (players.length !== playerIds.length) {
      const found = new Set(players.map((p) => p.id));
      const missing = playerIds.filter((id) => !found.has(id));
      throw new BadRequestException(`球员不存在: ${missing.join(", ")}`);
    }
  }

  /**
   * 薪资匹配检查：
   * 报价方送出薪资（含现金）与接收方送出薪资（含现金）的差距 ≤ 25%
   */
  private async checkSalaryMatch(dto: {
    offerorPlayers: string[];
    offereePlayers: string[];
    offerorCash: number;
    offereeCash: number;
  }): Promise<{ offerorSalary: number; offereeSalary: number; match: boolean }> {
    const [offerorPlayers, offereePlayers] = await Promise.all([
      this.prisma.player.findMany({
        where: { id: { in: dto.offerorPlayers } },
        select: { salary: true },
      }),
      this.prisma.player.findMany({
        where: { id: { in: dto.offereePlayers } },
        select: { salary: true },
      }),
    ]);

    const offerorSalary =
      offerorPlayers.reduce((sum, p) => sum + (p.salary ?? 0), 0) + (dto.offerorCash ?? 0);
    const offereeSalary =
      offereePlayers.reduce((sum, p) => sum + (p.salary ?? 0), 0) + (dto.offereeCash ?? 0);

    const maxSalary = Math.max(offerorSalary, offereeSalary);
    if (maxSalary === 0) return { offerorSalary, offereeSalary, match: true };

    const diff = Math.abs(offerorSalary - offereeSalary);
    const match = diff <= maxSalary * SALARY_MATCH_TOLERANCE;

    return { offerorSalary, offereeSalary, match };
  }

  private sumPlayerOVR(abilitiesList: Abilities[]): number {
    return abilitiesList.reduce((sum, a) => sum + overallRating(a), 0);
  }
}
