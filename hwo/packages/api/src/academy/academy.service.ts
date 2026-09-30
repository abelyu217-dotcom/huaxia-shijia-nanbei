/**
 * AcademyService——青训学院服务
 *
 * 职责：
 * 1. 查询/升级球队青训学院
 * 2. 赛季休赛期产出新秀球员（每年 1-3 名）
 * 3. 学院等级 + 投入资金影响新秀潜力上限
 */

import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { generateRookieAbilities } from "@hwo/shared";
import type { Prisma } from "@prisma/client";

/** 学院等级上限 */
const MAX_LEVEL = 5;
/** 每级升级费用 */
const UPGRADE_COST = [0, 50_000, 120_000, 250_000, 500_000];
/** 每级新秀潜力上限 */
const LEVEL_POTENTIAL_CAP = [0, 70, 76, 82, 88, 94];
/** 每级新秀产出数量范围 */
const LEVEL_PROD_COUNT = [0, 1, 1, 2, 2, 3];

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

@Injectable()
export class AcademyService {
  private readonly logger = new Logger(AcademyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 获取球队青训学院（不存在则自动创建 1 级） */
  async getAcademy(teamId: string) {
    let academy = await this.prisma.academy.findUnique({ where: { teamId } });
    if (!academy) {
      academy = await this.prisma.academy.create({
        data: { teamId, level: 1, investment: 0 },
      });
    }
    return academy;
  }

  /** 升级学院 */
  async upgradeAcademy(teamId: string) {
    const academy = await this.getAcademy(teamId);

    if (academy.level >= MAX_LEVEL) {
      throw new BadRequestException("学院已满级");
    }

    const cost = UPGRADE_COST[academy.level + 1]!;
    if (academy.investment < cost) {
      throw new BadRequestException(
        `投入资金不足：需要 $${cost.toLocaleString()}，当前 $${academy.investment.toLocaleString()}`,
      );
    }

    const updated = await this.prisma.academy.update({
      where: { teamId },
      data: {
        level: { increment: 1 },
      },
    });

    return {
      ...updated,
      upgradeCost: UPGRADE_COST[updated.level + 1] ?? null,
      nextLevelPotential: LEVEL_POTENTIAL_CAP[updated.level + 1] ?? null,
    };
  }

  /** 投入资金到学院 */
  async investAcademy(teamId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException("投入金额必须大于 0");
    }

    await this.getAcademy(teamId);
    const updated = await this.prisma.academy.update({
      where: { teamId },
      data: {
        investment: { increment: amount },
      },
    });

    return updated;
  }

  /**
   * 产出新秀（休赛期调用）
   *
   * 每年根据学院等级产出 1-3 名 19 岁新秀。
   * 潜力上限受学院等级影响。
   */
  async produceRookies(
    teamId: string,
    seasonYear: number,
  ): Promise<{
    produced: Array<{
      playerId: string;
      name: string;
      position: string;
      potential: number;
      ovr: number;
    }>;
  }> {
    const academy = await this.getAcademy(teamId);

    // 检查今年是否已产出
    if (academy.lastProdYear === seasonYear) {
      return { produced: [] };
    }

    const count = LEVEL_PROD_COUNT[academy.level] ?? 1;
    const potentialCap = LEVEL_POTENTIAL_CAP[academy.level] ?? 70;

    const produced: Array<{
      playerId: string;
      name: string;
      position: string;
      potential: number;
      ovr: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      // 潜力在 55 ~ potentialCap 之间随机
      const potential = 55 + Math.floor(Math.random() * (potentialCap - 55 + 1));
      const position = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]!;

      // 用简单 RNG 生成能力值
      const rng = Math.random;
      const abilities = generateRookieAbilities(potential, position, rng);

      const ovr = Math.round(
        Object.values(abilities).reduce((s, v) => s + v, 0) /
          Object.values(abilities).length,
      );

      // 生成球员姓名
      const name = this.generateRookieName();

      const playerId = `${teamId}-academy-${seasonYear}-${i + 1}`;
      const salary = Math.round(ovr * 80);

      const player = await this.prisma.player.create({
        data: {
          id: playerId,
          teamId,
          name,
          position,
          abilities: abilities as unknown as Prisma.InputJsonValue,
          traits: [],
          age: 19,
          salary,
          potential,
          trainExp: 0,
          retired: false,
        },
      });

      produced.push({
        playerId: player.id,
        name: player.name,
        position: player.position,
        potential,
        ovr,
      });
    }

    // 更新学院产出年份
    await this.prisma.academy.update({
      where: { teamId },
      data: { lastProdYear: seasonYear },
    });

    this.logger.log(
      `青训学院 ${teamId} 产出 ${produced.length} 名新秀（学院等级 ${academy.level}）`,
    );

    return { produced };
  }

  /**
   * 批量为所有球队产出新秀（赛季结束时调用）
   */
  async produceAllRookies(seasonYear: number): Promise<{
    teamsProcessed: number;
    totalRookies: number;
  }> {
    // 获取所有球队
    const teams = await this.prisma.team.findMany({
      select: { id: true },
    });

    let totalRookies = 0;

    for (const team of teams) {
      const { produced } = await this.produceRookies(team.id, seasonYear);
      totalRookies += produced.length;
    }

    this.logger.log(
      `青训批量产出完成：${teams.length} 支球队，${totalRookies} 名新秀`,
    );

    return { teamsProcessed: teams.length, totalRookies };
  }

  private generateRookieName(): string {
    const surnames = ["王", "李", "张", "刘", "陈", "杨", "黄", "赵", "周", "吴",
      "徐", "孙", "马", "朱", "胡", "郭", "林", "何", "高", "罗"];
    const givens = ["伟", "强", "磊", "洋", "勇", "军", "杰", "涛", "明", "超",
      "鹏", "斌", "波", "宇", "辉", "凯", "晨", "昊", "翔", "旭",
      "子轩", "浩然", "俊杰", "嘉伟", "思远", "梓涵", "雨泽", "博文", "启航", "天佑"];
    const s = surnames[Math.floor(Math.random() * surnames.length)]!;
    const g = givens[Math.floor(Math.random() * givens.length)]!;
    return `${s}${g}`;
  }
}
