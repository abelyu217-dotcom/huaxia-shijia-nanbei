/**
 * ScoutService——球探/迷雾系统服务
 *
 * 职责：
 * 1. 管理 ScoutReport（球探报告）的 CRUD
 * 2. 执行球员探查 / 潜力探查，收窄 fog
 * 3. 管理球探预算
 *
 * 参见 球探系统设计.html §3-§6
 */

import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  applyFog,
  performPlayerScout,
  performPotentialScout,
  PLAYER_SCOUT_COST,
  POTENTIAL_SCOUT_COST,
  SEASON_SCOUT_BUDGET,
  type Abilities,
  type FogValue,
  type ScoutReport,
  type Player,
  type Position,
} from "@hwo/shared";

// ── ScoutMission 视图类型 ──

export interface ScoutMissionView {
  id: string;
  teamId: string;
  scoutId: string;
  /** 目标类型：player | head_coach | asst_coach | trainer | agent | merchant | reporter | caster | arbiter | union_rep */
  targetType: string;
  /** 目标 ID（player id 或 professional id），为 null 表示区域侦察 */
  targetRef: string | null;
  region: string | null;
  status: "pending" | "completed" | "expired";
  report: Record<string, unknown> | null;
  accuracy: number | null;
  createdAt: string;
  completedAt: string | null;
}

@Injectable()
export class ScoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取某球队对某球员的球探报告
   */
  async getReport(teamId: string, playerId: string): Promise<ScoutReport | null> {
    const row = await this.prisma.scoutReport.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    });
    if (!row) return null;
    return this.toScoutReport(row);
  }

  /**
   * 获取某球队的所有球探报告
   */
  async getTeamReports(teamId: string): Promise<ScoutReport[]> {
    const rows = await this.prisma.scoutReport.findMany({
      where: { teamId },
      orderBy: { lastScoutedAt: "desc" },
    });
    return rows.map((r) => this.toScoutReport(r));
  }

  /**
   * 执行球员探查：收窄该球员全部能力 fog
   */
  async scoutPlayer(
    teamId: string,
    playerId: string,
  ): Promise<{ report: ScoutReport; cost: number }> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException(`球员 ${playerId} 不存在`);

    const existing = await this.getReport(teamId, playerId);
    const abilities = player.abilities as unknown as Abilities;
    const traits = (player.traits as string[]) ?? [];

    const { abilityFog, traitHints, scoutCount } = performPlayerScout(
      abilities,
      traits,
      player.age,
      existing?.scoutLevel ?? 3,
      existing,
    );

    const cost = PLAYER_SCOUT_COST;

    const upserted = await this.prisma.scoutReport.upsert({
      where: { teamId_playerId: { teamId, playerId } },
      create: {
        teamId,
        playerId,
        abilityFog: abilityFog as unknown as Prisma.JsonObject,
        traitHints: traitHints as unknown as Prisma.JsonArray,
        scoutCount,
        totalCost: cost,
        lastScoutedAt: new Date(),
      },
      update: {
        abilityFog: abilityFog as unknown as Prisma.JsonObject,
        traitHints: traitHints as unknown as Prisma.JsonArray,
        scoutCount,
        totalCost: { increment: cost },
        lastScoutedAt: new Date(),
      },
    });

    return { report: this.toScoutReport(upserted), cost };
  }

  /**
   * 执行潜力探查：收窄该球员 Peak fog
   */
  async scoutPotential(
    teamId: string,
    playerId: string,
  ): Promise<{ report: ScoutReport; cost: number }> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException(`球员 ${playerId} 不存在`);

    const existing = await this.getReport(teamId, playerId);
    const realPeak = player.potential ?? 75;

    const peakFog = performPotentialScout(
      realPeak,
      player.age,
      existing?.scoutLevel ?? 3,
      existing,
    );

    const cost = POTENTIAL_SCOUT_COST;
    const scoutCount = (existing?.scoutCount ?? 0) + 1;

    const upserted = await this.prisma.scoutReport.upsert({
      where: { teamId_playerId: { teamId, playerId } },
      create: {
        teamId,
        playerId,
        peakFog: peakFog as unknown as Prisma.JsonObject,
        traitHints: existing?.traitHints ?? ([] as unknown as Prisma.JsonArray),
        scoutCount,
        totalCost: cost,
        lastScoutedAt: new Date(),
      },
      update: {
        peakFog: peakFog as unknown as Prisma.JsonObject,
        scoutCount,
        totalCost: { increment: cost },
        lastScoutedAt: new Date(),
      },
    });

    return { report: this.toScoutReport(upserted), cost };
  }

  /**
   * 对一支球队的球员列表应用 fog（供 TeamController 使用）
   * 返回 fogged players 数组
   */
  async applyFogToTeamPlayers(
    viewerTeamId: string | null,
    targetTeamId: string,
    players: {
      id: string;
      name: string;
      position: string;
      abilities: unknown;
      traits: unknown;
      salary?: number | null;
      age?: number;
      fatigue?: number;
    }[],
  ): Promise<Array<{
    id: string;
    name: string;
    position: string;
    abilities: Partial<Record<keyof Abilities, FogValue>>;
    realAbilities?: Abilities;
    peak: FogValue | number | null;
    ovr: FogValue | number;
    traits: string[];
    salary?: number;
    age?: number;
    scouted: boolean;
  }>> {
    const isOwn = viewerTeamId === targetTeamId;

    // 批量获取该球队对这些球员的球探报告
    let reportMap = new Map<string, ScoutReport>();
    if (!isOwn && viewerTeamId) {
      const reports = await this.prisma.scoutReport.findMany({
        where: {
          teamId: viewerTeamId,
          playerId: { in: players.map((p) => p.id) },
        },
      });
      for (const r of reports) {
        reportMap.set(r.playerId, this.toScoutReport(r));
      }
    }

    return players.map((p) => {
      const abilities = p.abilities as Abilities;
      const player: Player = {
        id: p.id,
        name: p.name,
        position: p.position as Position,
        abilities,
        condition: { fatigue: (p.fatigue ?? 0) / 100, foulTrouble: 0, hot: 0 },
        traits: (p.traits as string[]) ?? [],
        salary: p.salary ?? 0,
      };
      const report = reportMap.get(p.id) ?? null;
      const fogged = applyFog(player, report, isOwn, 3, null);

      return {
        id: p.id,
        name: p.name,
        position: p.position,
        abilities: fogged.abilities,
        realAbilities: fogged.realAbilities,
        peak: fogged.peak,
        ovr: fogged.ovr,
        traits: fogged.traits,
        salary: p.salary ?? undefined,
        age: p.age,
        scouted: fogged.scouted,
      };
    });
  }

  /**
   * 获取球探预算状态
   */
  async getBudget(teamId: string): Promise<{
    remaining: number;
    total: number;
    used: number;
  }> {
    const reports = await this.prisma.scoutReport.findMany({
      where: { teamId },
      select: { totalCost: true },
    });
    const used = reports.reduce((sum, r) => sum + (r.totalCost ?? 0), 0);
    return {
      remaining: Math.max(0, SEASON_SCOUT_BUDGET - used),
      total: SEASON_SCOUT_BUDGET,
      used,
    };
  }

  // ─── ScoutMission：派向各类职员（player + 各类 staff） ───

  /**
   * 列出本队的 ScoutMission 任务
   * - status: pending | completed | expired（可选过滤）
   */
  async listMissions(
    teamId: string,
    opts: { status?: "pending" | "completed" | "expired" } = {},
  ): Promise<ScoutMissionView[]> {
    const where: { teamId: string; status?: string } = { teamId };
    if (opts.status) where.status = opts.status;

    const rows = await this.prisma.scoutMission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((r) => this.toMissionView(r));
  }

  /**
   * 创建一条 ScoutMission（派一名本队球探去探查目标）
   * - targetType: player | head_coach | asst_coach | trainer | agent | merchant | reporter | caster | arbiter | union_rep
   * - targetRef: 目标 ID（player id 或 professional id）；为 null 表示"区域侦察"
   */
  async createMission(opts: {
    teamId: string;
    scoutId: string;
    targetType: string;
    targetRef?: string | null;
    region?: string | null;
  }): Promise<ScoutMissionView> {
    // 校验球探属于本队
    const scout = await this.prisma.professional.findUnique({
      where: { id: opts.scoutId },
      select: { id: true, job: true, employerTeamId: true, level: true, employmentStatus: true },
    });
    if (!scout) throw new NotFoundException(`球探 ${opts.scoutId} 不存在`);
    if (scout.job !== "scout" || scout.employmentStatus !== "hired_by_manager" || scout.employerTeamId !== opts.teamId) {
      throw new BadRequestException("该职员不是本队雇佣的球探");
    }

    // 检查目标存在
    if (opts.targetRef) {
      if (opts.targetType === "player") {
        const p = await this.prisma.player.findUnique({ where: { id: opts.targetRef }, select: { id: true } });
        if (!p) throw new NotFoundException(`目标球员 ${opts.targetRef} 不存在`);
      } else {
        const pro = await this.prisma.professional.findUnique({
          where: { id: opts.targetRef },
          select: { id: true, job: true },
        });
        if (!pro) throw new NotFoundException(`目标职员 ${opts.targetRef} 不存在`);
        if (pro.job !== opts.targetType) {
          throw new BadRequestException(`目标职员类型不匹配：实际 ${pro.job}，期望 ${opts.targetType}`);
        }
      }
    }

    // 同一目标 + 同一球探不允许重复 pending
    const dup = await this.prisma.scoutMission.findFirst({
      where: {
        teamId: opts.teamId,
        scoutId: opts.scoutId,
        targetRef: opts.targetRef ?? null,
        targetType: opts.targetType,
        status: "pending",
      },
      select: { id: true },
    });
    if (dup) throw new BadRequestException("该球探已派向同一目标，请等待结果");

    const mission = await this.prisma.scoutMission.create({
      data: {
        teamId: opts.teamId,
        scoutId: opts.scoutId,
        targetType: opts.targetType,
        targetRef: opts.targetRef ?? null,
        region: opts.region ?? null,
        status: "pending",
      },
    });
    return this.toMissionView(mission);
  }

  /**
   * 完成一条 ScoutMission（计算结果并写入 report/accuracy）
   * - 由 schedule 每日推进时调用，或由 manager 手动推进
   */
  async completeMission(missionId: string): Promise<ScoutMissionView> {
    const mission = await this.prisma.scoutMission.findUnique({ where: { id: missionId } });
    if (!mission) throw new NotFoundException(`任务 ${missionId} 不存在`);
    if (mission.status !== "pending") throw new BadRequestException("该任务已结束");

    // 球探等级 + 随机 → 准确度 0-100
    const scout = await this.prisma.professional.findUnique({
      where: { id: mission.scoutId },
      select: { level: true },
    });
    const scoutLevel = scout?.level ?? 1;
    const base = 40 + scoutLevel * 5; // 等级 1 = 45，等级 10 = 90
    const accuracy = Math.max(10, Math.min(99, base + Math.round((Math.random() - 0.5) * 10)));

    let report: Record<string, unknown> = { type: "none" };

    if (mission.targetRef) {
      if (mission.targetType === "player") {
        // 复用已有球员探查逻辑，写一份 ScoutReport（收窄 fog）
        try {
          const r = await this.scoutPlayer(mission.teamId, mission.targetRef);
          report = {
            type: "player",
            abilityFog: r.report.abilityFog,
            peakFog: r.report.peakFog,
            traitHints: r.report.traitHints,
          };
        } catch {
          report = { type: "player", error: "scout failed" };
        }
      } else {
        // 职员：返回概要（部分字段在受限市场前对所有人可见）
        const pro = await this.prisma.professional.findUnique({
          where: { id: mission.targetRef },
          include: { user: { select: { nickname: true } } },
        });
        if (pro) {
          // 雇主信息仅在已签约时可见，未签约时只返回等级/声望范围
          report = {
            type: "staff",
            id: pro.id,
            name: pro.user?.nickname ?? pro.userId,
            job: pro.job,
            level: pro.level,
            proReputation: pro.proReputation,
            // 准确度低时打码
            levelRange: accuracy >= 80 ? null : { est: pro.level, range: 2 },
            employed: pro.employmentStatus !== "preset_npc" && pro.employmentStatus !== "unemployed",
          };
        } else {
          report = { type: "staff", error: "not found" };
        }
      }
    } else if (mission.region) {
      // 区域侦察：随机返回区域内若干候选
      report = {
        type: "region",
        region: mission.region,
        candidatesFound: Math.floor(Math.random() * 5) + 1,
      };
    }

    const updated = await this.prisma.scoutMission.update({
      where: { id: missionId },
      data: {
        status: "completed",
        completedAt: new Date(),
        report: report as unknown as Prisma.InputJsonValue,
        accuracy,
      },
    });
    return this.toMissionView(updated);
  }

  /** 撤回 pending 任务（不计算结果） */
  async cancelMission(missionId: string, teamId: string): Promise<void> {
    const m = await this.prisma.scoutMission.findUnique({ where: { id: missionId } });
    if (!m) throw new NotFoundException(`任务 ${missionId} 不存在`);
    if (m.teamId !== teamId) throw new BadRequestException("无权操作其他球队的任务");
    if (m.status !== "pending") throw new BadRequestException("该任务已结束");

    await this.prisma.scoutMission.update({
      where: { id: missionId },
      data: { status: "expired" },
    });
  }

  /** 每日推进：自动完成所有 pending 任务（由 schedule 调用） */
  async runDailyCompleteMissions(): Promise<{ completed: number }> {
    const pendings = await this.prisma.scoutMission.findMany({
      where: { status: "pending" },
      select: { id: true },
    });
    let completed = 0;
    for (const p of pendings) {
      try {
        await this.completeMission(p.id);
        completed++;
      } catch {
        // 单条失败不影响其他任务
      }
    }
    return { completed };
  }

  private toMissionView(r: {
    id: string;
    teamId: string;
    scoutId: string;
    targetType: string;
    targetRef: string | null;
    region: string | null;
    status: string;
    report: unknown;
    accuracy: number | null;
    createdAt: Date;
    completedAt: Date | null;
  }): ScoutMissionView {
    return {
      id: r.id,
      teamId: r.teamId,
      scoutId: r.scoutId,
      targetType: r.targetType,
      targetRef: r.targetRef,
      region: r.region,
      status: r.status as "pending" | "completed" | "expired",
      report: r.report as Record<string, unknown> | null,
      accuracy: r.accuracy,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    };
  }

  // ─── 内部方法 ───

  private toScoutReport(row: {
    teamId: string;
    playerId: string;
    abilityFog: unknown;
    peakFog: unknown;
    traitHints: unknown;
    lastScoutedAt: Date;
    scoutCount: number;
    scoutLevel: number;
    totalCost: number;
  }): ScoutReport {
    return {
      teamId: row.teamId,
      playerId: row.playerId,
      abilityFog: (row.abilityFog ?? {}) as ScoutReport["abilityFog"],
      peakFog: (row.peakFog ?? null) as ScoutReport["peakFog"],
      traitHints: (row.traitHints ?? []) as string[],
      lastScoutedAt: row.lastScoutedAt.toISOString(),
      scoutCount: row.scoutCount,
      scoutLevel: row.scoutLevel,
    };
  }
}

// 临时引入 Prisma 类型（避免在文件顶部重复 import）
import type { Prisma } from "@prisma/client";
