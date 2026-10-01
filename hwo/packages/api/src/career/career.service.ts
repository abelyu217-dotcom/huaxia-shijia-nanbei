/**
 * CareerService——球员生涯弧线服务
 *
 * 职责：
 * 1. 赛季结束时推进所有球员年龄 +1，应用成长/衰退
 * 2. 自动退役 37+ 且 OVR 跌破阈值的球员
 * 3. 查询球员生涯信息（阶段、潜力、成长趋势）
 * 4. 手动训练球员：按 drill 类型定向提升属性
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

/** 训练类型及其主攻属性 */
export type DrillType =
  | "shooting"    // 投篮：三分 + 中投
  | "ball_handling" // 控球：控球 + 传球
  | "defense"     // 防守：外线防守 + 抢断
  | "inside"      // 内线：内线 + 低位 + 力量
  | "athletic"    // 体能：速度 + 弹跳 + 体能
  | "iq";         // 球商：球商 + 传球

interface DrillConfig {
  label: string;
  /** 主攻属性及权重 */
  primary: Partial<Record<keyof Abilities, number>>;
  /** 次要属性及权重 */
  secondary: Partial<Record<keyof Abilities, number>>;
}

const DRILL_CONFIGS: Record<DrillType, DrillConfig> = {
  shooting: {
    label: "投篮训练",
    primary: { three: 1.5, midrange: 1.5 },
    secondary: { inside: 0.3, drive: 0.3 },
  },
  ball_handling: {
    label: "控球训练",
    primary: { ballHandle: 1.5, passing: 1.2 },
    secondary: { drive: 0.4, iq: 0.3 },
  },
  defense: {
    label: "防守训练",
    primary: { perimeterD: 1.5, steal: 1.3 },
    secondary: { interiorD: 0.5, block: 0.3 },
  },
  inside: {
    label: "内线训练",
    primary: { inside: 1.5, postup: 1.4, strength: 1.0 },
    secondary: { jumping: 0.4, block: 0.3 },
  },
  athletic: {
    label: "体能训练",
    primary: { speed: 1.4, jumping: 1.3, stamina: 1.4 },
    secondary: { strength: 0.4, drive: 0.3 },
  },
  iq: {
    label: "球商训练",
    primary: { iq: 1.5, passing: 1.0 },
    secondary: { perimeterD: 0.3, ballHandle: 0.3 },
  },
};

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
  async trainPlayer(
    playerId: string,
    drillType?: DrillType,
  ): Promise<{
    playerId: string;
    drillType: DrillType;
    drillLabel: string;
    ovrBefore: number;
    ovrAfter: number;
    improved: boolean;
    /** 各属性变化量（仅包含有变化的属性） */
    attributeChanges: { ability: keyof Abilities; before: number; after: number; delta: number }[];
  } | null> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) return null;
    if (player.retired) return null;

    const drill = drillType && DRILL_CONFIGS[drillType]
      ? drillType
      : "shooting";
    const cfg = DRILL_CONFIGS[drill];

    const abilities = player.abilities as unknown as Abilities;
    const ovrBefore = computeOVR(abilities);
    const potential = player.potential ?? 75;
    const stage = getCareerStage(player.age);

    // 只有成长阶段可以训练提升
    if (stage === "decline" || stage === "retired") {
      return {
        playerId,
        drillType: drill,
        drillLabel: cfg.label,
        ovrBefore,
        ovrAfter: ovrBefore,
        improved: false,
        attributeChanges: [],
      };
    }

    const newAbilities = { ...abilities };
    const attributeChanges: { ability: keyof Abilities; before: number; after: number; delta: number }[] = [];
    let improved = false;

    // 合并主攻 + 次要属性权重
    const weights: Partial<Record<keyof Abilities, number>> = {
      ...cfg.secondary,
      ...cfg.primary,
    };

    for (const key of Object.keys(weights) as (keyof Abilities)[]) {
      const weight = weights[key] ?? 0;
      if (weight <= 0) continue;
      const current = newAbilities[key];
      const room = potential - current;
      if (room <= 0) continue;

      // 基础成长 0.3-0.8，乘以权重，向潜力上限靠拢
      const baseGrowth = 0.3 + Math.random() * 0.5;
      const growth = Math.min(room, baseGrowth * weight);
      const after = Math.min(99, Math.round((current + growth) * 10) / 10);
      const delta = Math.round((after - current) * 10) / 10;

      if (delta > 0) {
        newAbilities[key] = after;
        improved = true;
        attributeChanges.push({ ability: key, before: current, after, delta });
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

    return {
      playerId,
      drillType: drill,
      drillLabel: cfg.label,
      ovrBefore,
      ovrAfter,
      improved,
      attributeChanges,
    };
  }
}
