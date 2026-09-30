/**
 * CareerService——球员生涯弧线服务
 *
 * 职责：
 * 1. 赛季结束时推进所有球员年龄 +1，应用成长/衰退
 * 2. 自动退役 37+ 且 OVR 跌破阈值的球员
 * 3. 查询球员生涯信息（阶段、潜力、成长趋势）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  applySeasonGrowth,
  computeOVR,
  getCareerStage,
  STAGE_LABEL,
  type Abilities,
} from "@hwo/shared";
import type { Prisma } from "@prisma/client";

@Injectable()
export class CareerService {
  private readonly logger = new Logger(CareerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 赛季结束时推进所有球员的成长
   * - 年龄 +1
   * - 应用生涯弧线成长/衰退
   * - 自动退役 37+ OVR<55 的球员
   */
  async advanceAllPlayers(seasonYear: number): Promise<{
    grown: number;
    retired: number;
  }> {
    let grown = 0;
    let retired = 0;

    // 获取所有未退役球员
    const players = await this.prisma.player.findMany({
      where: { retired: false },
    });

    // 获取上场时间（从 lineup 表的 minutes 字段）
    const lineups = await this.prisma.lineup.findMany();
    const minutesMap = new Map<string, number>();
    for (const lineup of lineups) {
      const minutes = lineup.minutes as Record<string, number>;
      for (const [playerId, mins] of Object.entries(minutes)) {
        minutesMap.set(playerId, mins);
      }
    }

    for (const player of players) {
      const newAge = player.age + 1;
      const abilities = player.abilities as unknown as Abilities;
      const potential = player.potential ?? 75;
      const minutesPerGame = minutesMap.get(player.id) ?? 20;

      const { abilities: newAbilities, shouldRetire } = applySeasonGrowth(
        abilities,
        newAge,
        potential,
        minutesPerGame,
      );

      if (shouldRetire) {
        // 退役
        await this.prisma.player.update({
          where: { id: player.id },
          data: {
            age: newAge,
            abilities: newAbilities as unknown as Prisma.InputJsonValue,
            trainExp: player.trainExp + 20,
            retired: true,
            retireSeason: seasonYear,
          },
        });
        retired++;
      } else {
        // 正常成长
        await this.prisma.player.update({
          where: { id: player.id },
          data: {
            age: newAge,
            abilities: newAbilities as unknown as Prisma.InputJsonValue,
            trainExp: player.trainExp + Math.round(20 + minutesPerGame * 1.5),
          },
        });
        grown++;
      }
    }

    this.logger.log(
      `赛季成长完成：${grown} 名球员成长，${retired} 名球员退役`,
    );
    return { grown, retired };
  }

  /**
   * 获取球员生涯信息
   */
  async getPlayerCareer(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) return null;

    const abilities = player.abilities as unknown as Abilities;
    const ovr = computeOVR(abilities);
    const stage = getCareerStage(player.age);
    const potential = player.potential ?? 75;

    return {
      playerId: player.id,
      name: player.name,
      age: player.age,
      position: player.position,
      ovr,
      potential,
      stage,
      stageLabel: STAGE_LABEL[stage],
      trainExp: player.trainExp,
      retired: player.retired,
      retireSeason: player.retireSeason,
      // 成长空间 = 潜力 - 当前 OVR
      growthRoom: Math.max(0, potential - ovr),
    };
  }

  /**
   * 批量获取球队球员生涯信息
   */
  async getTeamPlayerCareers(teamId: string) {
    const players = await this.prisma.player.findMany({
      where: { teamId, retired: false },
      orderBy: { age: "asc" },
    });

    return players.map((p) => {
      const abilities = p.abilities as unknown as Abilities;
      const ovr = computeOVR(abilities);
      const stage = getCareerStage(p.age);
      const potential = p.potential ?? 75;

      return {
        playerId: p.id,
        name: p.name,
        age: p.age,
        position: p.position,
        ovr,
        potential,
        stage,
        stageLabel: STAGE_LABEL[stage],
        trainExp: p.trainExp,
        growthRoom: Math.max(0, potential - ovr),
        salary: p.salary,
      };
    });
  }

  /**
   * 手动训练单个球员（消耗训练经验加速成长）
   */
  async trainPlayer(playerId: string): Promise<{
    playerId: string;
    ovrBefore: number;
    ovrAfter: number;
    improved: boolean;
  } | null> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) return null;
    if (player.retired) return null;

    const abilities = player.abilities as unknown as Abilities;
    const ovrBefore = computeOVR(abilities);
    const potential = player.potential ?? 75;
    const stage = getCareerStage(player.age);

    // 只有成长阶段可以训练提升
    if (stage === "decline" || stage === "retired") {
      return {
        playerId,
        ovrBefore,
        ovrAfter: ovrBefore,
        improved: false,
      };
    }

    // 训练：向潜力上限靠拢
    const keys = Object.keys(abilities) as (keyof Abilities)[];
    const newAbilities = { ...abilities };
    let improved = false;

    for (const key of keys) {
      const current = newAbilities[key];
      const room = potential - current;
      if (room > 0) {
        // 每次训练提升 0.5-1.5 点
        const growth = Math.min(room, 0.5 + Math.random());
        newAbilities[key] = Math.min(99, Math.round((current + growth) * 10) / 10);
        if (growth > 0) improved = true;
      }
    }

    const ovrAfter = computeOVR(newAbilities);

    await this.prisma.player.update({
      where: { id: playerId },
      data: {
        abilities: newAbilities as unknown as Prisma.InputJsonValue,
        trainExp: { increment: 50 },
      },
    });

    return { playerId, ovrBefore, ovrAfter, improved };
  }
}
