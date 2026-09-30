/**
 * DraftService——选秀系统服务
 *
 * 职责：
 * 1. 休赛期生成选秀大会顺位（DraftPick）+ 选秀池（prospect 球员）
 * 2. 乐透抽签：根据战绩倒序加权，决定首轮顺位顺序
 * 3. 选秀大会：球队按顺位选人，AI 球队自动选最优可用球员
 *
 * 设计：
 * - 选秀池球员暂存于每赛季专属的 "DRAFT_POOL_<seasonId>" 球队名下
 * - 被选中后转移到选秀球队 teamId
 * - 参见：开发计划.html §4.4 选秀系统
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { generateRookieAbilities, computeOVR, type Abilities } from "@hwo/shared";
import type { Prisma } from "@prisma/client";

/** 每轮顺位数（每世界 16 队） */
const TEAMS_PER_WORLD = 16;
/** 选秀轮数 */
const DRAFT_ROUNDS = 2;
/** 每年选秀池额外产生的球员数（覆盖非青训来源） */
const EXTRA_PROSPECTS = 16;

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

@Injectable()
export class DraftService {
  private readonly logger = new Logger(DraftService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 初始化选秀大会：
   * 1. 获取该世界所有球队（按战绩倒序）
   * 2. 乐透抽签决定首轮顺位
   * 3. 创建 DraftPick 记录（2 轮 × 16 顺位）
   * 4. 生成选秀池球员（暂存于 draft pool 球队）
   */
  async initDraft(seasonId: string, worldId: string): Promise<{
    picksCreated: number;
    prospectsCreated: number;
    lotteryOrder: Array<{ teamId: string; pickNum: number }>;
  }> {
    // 检查是否已初始化
    const existing = await this.prisma.draftPick.findMany({
      where: { seasonId, worldId },
    });
    if (existing.length > 0) {
      throw new BadRequestException("该赛季选秀大会已初始化");
    }

    // 1. 获取世界内所有球队及其战绩
    const teams = await this.prisma.team.findMany({
      where: { worldId },
      select: {
        id: true,
        name: true,
        standings: {
          where: { seasonId },
          select: { wins: true, losses: true },
          take: 1,
        },
      },
    });

    if (teams.length === 0) {
      throw new NotFoundException(`世界 ${worldId} 无球队`);
    }

    // 2. 乐透抽签：战绩越差权重越高
    const lotteryOrder = this.runLottery(
      teams.map((t) => ({
        teamId: t.id,
        wins: t.standings[0]?.wins ?? 0,
        losses: t.standings[0]?.losses ?? 0,
      })),
    );

    // 3. 创建 DraftPick 记录（首轮按乐透顺序，次轮按战绩倒序）
    const picksData: Array<{
      seasonId: string;
      worldId: string;
      round: number;
      pickNum: number;
      teamId: string;
    }> = [];

    // 首轮：乐透顺序
    lotteryOrder.forEach((slot, idx) => {
      picksData.push({
        seasonId,
        worldId,
        round: 1,
        pickNum: idx + 1,
        teamId: slot.teamId,
      });
    });

    // 次轮：直接战绩倒序（无乐透）
    const secondRoundOrder = [...teams].sort((a, b) => {
      const aLosses = a.standings[0]?.losses ?? 0;
      const bLosses = b.standings[0]?.losses ?? 0;
      const aWins = a.standings[0]?.wins ?? 0;
      const bWins = b.standings[0]?.wins ?? 0;
      const aRate = aWins + aLosses === 0 ? 0 : aWins / (aWins + aLosses);
      const bRate = bWins + bLosses === 0 ? 0 : bWins / (bWins + bLosses);
      return aRate - bRate; // 胜率升序（差队在前）
    });

    secondRoundOrder.forEach((t, idx) => {
      picksData.push({
        seasonId,
        worldId,
        round: 2,
        pickNum: idx + 1,
        teamId: t.id,
      });
    });

    await this.prisma.draftPick.createMany({ data: picksData });

    // 4. 生成选秀池球员
    const draftPoolTeamId = await this.ensureDraftPoolTeam(seasonId, worldId);
    const prospectsCreated = await this.generateProspects(
      draftPoolTeamId,
      seasonId,
      TEAMS_PER_WORLD * DRAFT_ROUNDS + EXTRA_PROSPECTS,
    );

    this.logger.log(
      `选秀大会初始化：赛季 ${seasonId}，世界 ${worldId}，` +
        `${picksData.length} 个顺位，${prospectsCreated} 名新秀进入选秀池`,
    );

    return {
      picksCreated: picksData.length,
      prospectsCreated,
      lotteryOrder: lotteryOrder.map((s, i) => ({
        teamId: s.teamId,
        pickNum: i + 1,
      })),
    };
  }

  /**
   * 乐透抽签：战绩倒序加权
   * - 最差球队最高权重，最佳球队最低权重
   * - 返回首轮顺位顺序（index 0 = 状元签）
   */
  private runLottery(
    teams: Array<{ teamId: string; wins: number; losses: number }>,
  ): Array<{ teamId: string; wins: number; losses: number }> {
    // 计算权重：胜率越低权重越高
    // 权重 = (1 - 胜率) ^ 2，再放大
    const weighted = teams.map((t) => {
      const games = t.wins + t.losses;
      const winRate = games === 0 ? 0.5 : t.wins / games;
      // 胜率越低，权重越大；平方放大差距
      const weight = Math.pow(1 - winRate, 2) * 1000 + 1;
      return { ...t, weight };
    });

    const totalWeight = weighted.reduce((s, t) => s + t.weight, 0);
    const order: Array<{ teamId: string; wins: number; losses: number }> = [];
    const remaining = [...weighted];

    // 依次抽签：每轮按权重随机选一队
    while (remaining.length > 0) {
      const r = Math.random() * totalWeight;
      let acc = 0;
      let pickedIdx = 0;
      for (let i = 0; i < remaining.length; i++) {
        acc += remaining[i]!.weight;
        if (r <= acc) {
          pickedIdx = i;
          break;
        }
      }
      const picked = remaining.splice(pickedIdx, 1)[0]!;
      order.push({
        teamId: picked.teamId,
        wins: picked.wins,
        losses: picked.losses,
      });
    }

    return order;
  }

  /**
   * 获取选秀看板：
   * - 所有顺位（含已选/未选）
   * - 选秀池中尚未被选中的球员（按 OVR 降序）
   */
  async getDraftBoard(seasonId: string, worldId: string) {
    const picks = await this.prisma.draftPick.findMany({
      where: { seasonId, worldId },
      orderBy: [{ round: "asc" }, { pickNum: "asc" }],
      include: {
        team: { select: { id: true, name: true } },
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            age: true,
            potential: true,
            abilities: true,
          },
        },
      },
    });

    const draftPoolTeamId = this.draftPoolTeamId(seasonId, worldId);
    const available = await this.prisma.player.findMany({
      where: { teamId: draftPoolTeamId },
      select: {
        id: true,
        name: true,
        position: true,
        age: true,
        potential: true,
        abilities: true,
      },
    });

    // 计算每名可用球员的 OVR
    const availableWithOvr = available
      .map((p) => ({
        ...p,
        ovr: this.computeOvrFromAbilities(p.abilities as unknown as Abilities),
      }))
      .sort((a, b) => b.ovr - a.ovr);

    return { picks, available: availableWithOvr };
  }

  /**
   * 选人：把指定球员分配给指定顺位
   * - 球员必须仍在选秀池中
   * - 顺位必须未被使用
   */
  async makePick(
    draftPickId: string,
    playerId: string,
  ): Promise<{ success: true; pick: number; round: number; player: { id: string; name: string } }> {
    const pick = await this.prisma.draftPick.findUnique({
      where: { id: draftPickId },
    });
    if (!pick) {
      throw new NotFoundException("顺位不存在");
    }
    if (pick.playerId) {
      throw new BadRequestException("该顺位已被使用");
    }

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) {
      throw new NotFoundException("球员不存在");
    }

    // 球员必须在选秀池球队中
    const draftPoolTeamId = this.draftPoolTeamId(pick.seasonId, pick.worldId ?? "");
    if (player.teamId !== draftPoolTeamId) {
      throw new BadRequestException("该球员不在选秀池中");
    }

    // 转移球员到选秀球队
    await this.prisma.$transaction([
      this.prisma.player.update({
        where: { id: playerId },
        data: { teamId: pick.teamId! },
      }),
      this.prisma.draftPick.update({
        where: { id: draftPickId },
        data: { playerId },
      }),
    ]);

    this.logger.log(
      `选秀：第 ${pick.round} 轮第 ${pick.pickNum} 顺位 → ${player.name}（球队 ${pick.teamId}）`,
    );

    return {
      success: true,
      pick: pick.pickNum,
      round: pick.round,
      player: { id: player.id, name: player.name },
    };
  }

  /**
   * 自动选秀：AI 球队按 OVR 最优自动选人
   * - 按顺位顺序处理所有未选顺位
   * - 每个顺位选当前选秀池中 OVR 最高的球员
   */
  async autoDraft(seasonId: string, worldId: string): Promise<{
    picked: number;
    picks: Array<{ round: number; pickNum: number; teamId: string; playerName: string }>;
  }> {
    const unpicked = await this.prisma.draftPick.findMany({
      where: { seasonId, worldId, playerId: null },
      orderBy: [{ round: "asc" }, { pickNum: "asc" }],
    });

    const draftPoolTeamId = this.draftPoolTeamId(seasonId, worldId);
    const picked: Array<{
      round: number;
      pickNum: number;
      teamId: string;
      playerName: string;
    }> = [];

    for (const pick of unpicked) {
      // 选当前选秀池中 OVR 最高的球员
      const candidates = await this.prisma.player.findMany({
        where: { teamId: draftPoolTeamId },
        select: { id: true, name: true, abilities: true },
      });

      if (candidates.length === 0) break;

      const best = candidates
        .map((c) => ({
          ...c,
          ovr: this.computeOvrFromAbilities(c.abilities as unknown as Abilities),
        }))
        .sort((a, b) => b.ovr - a.ovr)[0]!;

      await this.prisma.$transaction([
        this.prisma.player.update({
          where: { id: best.id },
          data: { teamId: pick.teamId! },
        }),
        this.prisma.draftPick.update({
          where: { id: pick.id },
          data: { playerId: best.id },
        }),
      ]);

      picked.push({
        round: pick.round,
        pickNum: pick.pickNum,
        teamId: pick.teamId!,
        playerName: best.name,
      });
    }

    this.logger.log(
      `自动选秀完成：赛季 ${seasonId}，世界 ${worldId}，共选 ${picked.length} 人`,
    );

    return { picked: picked.length, picks: picked };
  }

  /** 获取选秀结果（已选顺位） */
  async getDraftResults(seasonId: string, worldId: string) {
    const picks = await this.prisma.draftPick.findMany({
      where: { seasonId, worldId, playerId: { not: null } },
      orderBy: [{ round: "asc" }, { pickNum: "asc" }],
      include: {
        team: { select: { id: true, name: true } },
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            age: true,
            potential: true,
          },
        },
      },
    });
    return picks;
  }

  // ─── 内部工具 ───

  private draftPoolTeamId(seasonId: string, worldId: string): string {
    return `DRAFT_POOL_${worldId}_${seasonId}`;
  }

  /** 确保选秀池球队存在（无联赛/世界归属，不参与积分榜） */
  private async ensureDraftPoolTeam(
    seasonId: string,
    worldId: string,
  ): Promise<string> {
    const teamId = this.draftPoolTeamId(seasonId, worldId);
    let team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      team = await this.prisma.team.create({
        data: {
          id: teamId,
          name: `选秀池 ${seasonId.slice(-6)}`,
        },
      });
    }
    return teamId;
  }

  /** 生成选秀池球员 */
  private async generateProspects(
    draftPoolTeamId: string,
    seasonId: string,
    count: number,
  ): Promise<number> {
    let created = 0;

    for (let i = 0; i < count; i++) {
      // 潜力分布：以 65 为中心，少量高顺位天才
      const potentialRoll = Math.random();
      let potential: number;
      if (potentialRoll > 0.95) {
        potential = 85 + Math.floor(Math.random() * 8); // 85-92 状元级
      } else if (potentialRoll > 0.75) {
        potential = 75 + Math.floor(Math.random() * 8); // 75-82 乐透级
      } else {
        potential = 60 + Math.floor(Math.random() * 13); // 60-72 轮换级
      }

      const position = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]!;
      const abilities = generateRookieAbilities(potential, position, Math.random);
      const ovr = computeOVR(abilities);
      const name = this.generateProspectName();

      const playerId = `DRAFT_${seasonId.slice(-6)}_${i + 1}`;
      const salary = Math.round(ovr * 80);

      await this.prisma.player.create({
        data: {
          id: playerId,
          teamId: draftPoolTeamId,
          name,
          position,
          abilities: abilities as unknown as Prisma.InputJsonValue,
          traits: [],
          age: 19 + Math.floor(Math.random() * 2), // 19-20 岁
          salary,
          potential,
          trainExp: 0,
          retired: false,
        },
      });
      created++;
    }

    return created;
  }

  private computeOvrFromAbilities(abilities: Abilities): number {
    return computeOVR(abilities);
  }

  private generateProspectName(): string {
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
